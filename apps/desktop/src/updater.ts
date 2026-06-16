/*
Copyright 2016-2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import * as path from "node:path";
import * as fs from "node:fs";
import * as https from "node:https";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { app, ipcMain } from "electron";

import type { AppUpdater, UpdateInfo } from "electron-updater";
import Store from "./store.js";

const _require = createRequire(import.meta.url);
const { autoUpdater } = _require("electron-updater") as { autoUpdater: AppUpdater };

const UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_UPDATE_DELAY_MS = 30 * 1000;
const AUTO_UPDATE_SETTING = "automaticallyKeepClientUpToDate";

interface ICachedUpdate {
    releaseNotes: string;
    releaseName: string;
    releaseDate: Date;
    updateURL: string;
}

let started = false;
let latestUpdateDownloaded: ICachedUpdate | undefined;

function normaliseReleaseNotes(releaseNotes: UpdateInfo["releaseNotes"]): string {
    if (typeof releaseNotes === "string") return releaseNotes;
    if (Array.isArray(releaseNotes)) {
        return releaseNotes
            .map((note) => note.note)
            .filter(Boolean)
            .join("\n\n");
    }
    return "";
}

function getReleasePage(version: string): string {
    const tag = version.startsWith("v") ? version : `v${version}`;
    return `https://github.com/shootie22/element-web/releases/tag/${tag}`;
}

function getArtifactDownloadUrl(version: string): string {
    const tag = version.startsWith("v") ? version : `v${version}`;
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return `https://github.com/shootie22/element-web/releases/download/${tag}/element-desktop-${version}-linux-${arch}.tar.gz`;
}

function getInstallDir(): string {
    return path.dirname(app.getPath("exe"));
}

export function getPendingUpdate(): ICachedUpdate | undefined {
    return latestUpdateDownloaded;
}

export function automaticUpdatesEnabled(): boolean {
    return Store.instance?.get(AUTO_UPDATE_SETTING) !== false;
}

export function available(): boolean {
    if (!app.isPackaged) return false;
    if (process.platform === "win32") return true;
    if (process.platform === "linux") return true;
    // macOS update signing and notarisation setup is intentionally out of scope for this GitHub Releases path.
    return false;
}

function ipcChannelSendUpdateStatus(status: boolean | string): void {
    global.mainWindow?.webContents.send("check_updates", status);
}

function notifyDownloaded(update: ICachedUpdate): void {
    global.mainWindow?.webContents.send("update-downloaded", update);
}

function downloadFile(url: string, dest: string, redirects = 0): Promise<void> {
    if (redirects > 10) return Promise.reject(new Error("Too many redirects"));
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (
                response.statusCode != null &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
            ) {
                file.close();
                fs.unlink(dest, () => {});
                resolve(downloadFile(response.headers.location, dest, redirects + 1));
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Download failed: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
            });
        }).on("error", (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

function installUpdate(): void {
    if (!latestUpdateDownloaded) return;

    global.appQuitting = true;

    if (process.platform === "linux") {
        const installDir = getInstallDir();
        const arch = process.arch === "arm64" ? "arm64" : "x64";
        const updateFile = path.join(
            app.getPath("temp"),
            `element-desktop-${latestUpdateDownloaded.releaseName}-linux-${arch}.tar.gz`,
        );
        try {
            console.log(`Extracting update to ${installDir}`);
            const result = spawnSync("tar", [
                "-xzf", updateFile,
                "-C", installDir,
                "--strip-components=1",
            ], { stdio: "pipe", timeout: 30000 });
            if (result.status !== 0) {
                throw new Error(result.stderr.toString() || `tar exited with code ${result.status}`);
            }
            fs.unlinkSync(updateFile);
            console.log("Update installed, restarting");
            app.relaunch();
            app.exit(0);
        } catch (e) {
            console.error("Failed to install update:", e);
        }
    } else {
        autoUpdater.quitAndInstall();
    }
}

async function checkForUpdates(manual = false): Promise<void> {
    if (!available()) {
        if (manual) ipcChannelSendUpdateStatus("Auto update is not supported for this build.");
        return;
    }

    if (!manual && !automaticUpdatesEnabled()) {
        console.log("Skipping automatic update check because it is disabled in settings");
        return;
    }

    if (latestUpdateDownloaded) {
        console.log("Skipping update check as download already present");
        notifyDownloaded(latestUpdateDownloaded);
        return;
    }

    try {
        await autoUpdater.checkForUpdates();
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.log("Couldn't check for update", e);
        ipcChannelSendUpdateStatus(error);
    }
}

async function automaticCheckForUpdates(): Promise<void> {
    await checkForUpdates(false);
}

async function manualCheckForUpdates(): Promise<void> {
    await checkForUpdates(true);
}

export async function start(): Promise<void> {
    if (started) return;
    started = true;

    if (!available()) {
        console.warn("Auto update not supported for this build");
        return;
    }

    console.log("Starting GitHub Releases auto update");

    if (process.platform === "linux") {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
    } else {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
    }

    setTimeout(automaticCheckForUpdates, INITIAL_UPDATE_DELAY_MS);
    setInterval(automaticCheckForUpdates, UPDATE_POLL_INTERVAL_MS);
}

ipcMain.on("install_update", installUpdate);
ipcMain.on("check_updates", manualCheckForUpdates);

autoUpdater
    .on("update-available", async (info: UpdateInfo) => {
        ipcChannelSendUpdateStatus(true);
        if (process.platform === "linux") {
            const version = info.version;
            const arch = process.arch === "arm64" ? "arm64" : "x64";
            const url = getArtifactDownloadUrl(version);
            const dest = path.join(
                app.getPath("temp"),
                `element-desktop-${version}-linux-${arch}.tar.gz`,
            );
            try {
                console.log(`Downloading update from ${url}`);
                await downloadFile(url, dest);
                latestUpdateDownloaded = {
                    releaseNotes: normaliseReleaseNotes(info.releaseNotes),
                    releaseName: version,
                    releaseDate: new Date(info.releaseDate),
                    updateURL: getReleasePage(version),
                };
                console.log(`Update ${version} downloaded`);
                notifyDownloaded(latestUpdateDownloaded);
            } catch (e) {
                console.error("Failed to download update:", e);
                ipcChannelSendUpdateStatus(
                    e instanceof Error ? e.message : String(e),
                );
            }
        }
    })
    .on("update-not-available", function () {
        if (latestUpdateDownloaded) {
            notifyDownloaded(latestUpdateDownloaded);
        } else {
            ipcChannelSendUpdateStatus(false);
        }
    })
    .on("error", function (error) {
        ipcChannelSendUpdateStatus(error.message);
    });

autoUpdater.on("update-downloaded", ({ releaseNotes, version, releaseDate }) => {
    latestUpdateDownloaded = {
        releaseNotes: normaliseReleaseNotes(releaseNotes),
        releaseName: version,
        releaseDate: new Date(releaseDate),
        updateURL: getReleasePage(version),
    };
    notifyDownloaded(latestUpdateDownloaded);
});
