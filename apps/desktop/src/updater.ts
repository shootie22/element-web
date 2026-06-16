/*
Copyright 2016-2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import * as path from "node:path";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { app, ipcMain } from "electron";

import type { AppUpdater, UpdateInfo } from "electron-updater";
import Store from "./store.js";
import { getBuildConfig } from "./build-config.js";
import {
    artifactArchNamesForProcess,
    downloadAndVerifyFile,
    normaliseVersion,
    requestJson,
    tagForVersion,
    validateVerboseTarListing,
    verifyUpdateManifest,
    type UpdateManifestEnvelope,
    type UpdateManifestPayload,
} from "./linux-tarball-updater.js";

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
    linuxTarballPath?: string;
    linuxTarballPayload?: UpdateManifestPayload;
}

interface GitHubRelease {
    tag_name: string;
    body?: string;
    published_at?: string;
    draft?: boolean;
    prerelease?: boolean;
}

let started = false;
let latestUpdateDownloaded: ICachedUpdate | undefined;
let checkingLinuxTarballUpdate = false;

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
    const tag = tagForVersion(version);
    return `https://github.com/shootie22/element-web/releases/tag/${tag}`;
}

function getManifestDownloadUrl(version: string): string {
    const normalisedVersion = normaliseVersion(version);
    const tag = tagForVersion(version);
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return `https://github.com/shootie22/element-web/releases/download/${tag}/element-desktop-${normalisedVersion}-linux-${arch}.tar.gz.update.json`;
}

function getLatestReleaseUrl(): string {
    return "https://api.github.com/repos/shootie22/element-web/releases/latest";
}

function getInstallDir(): string {
    return path.dirname(app.getPath("exe"));
}

function isLinuxTarballInstall(): boolean {
    if (process.platform !== "linux" || !app.isPackaged) return false;
    if (process.env.APPIMAGE) return false;

    const packageTypeFile = path.join(process.resourcesPath, "package-type");
    if (!fs.existsSync(packageTypeFile)) return true;

    const packageType = fs.readFileSync(packageTypeFile, "utf8").trim();
    return packageType === "" || packageType === "tar.gz";
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
    if (process.platform === "linux") return Boolean(process.env.APPIMAGE) || isLinuxTarballInstall();
    // macOS update signing and notarisation setup is intentionally out of scope for this GitHub Releases path.
    return false;
}

function ipcChannelSendUpdateStatus(status: boolean | string): void {
    global.mainWindow?.webContents.send("check_updates", status);
}

function notifyDownloaded(update: ICachedUpdate): void {
    global.mainWindow?.webContents.send("update-downloaded", update);
}

function installUpdate(): void {
    if (!latestUpdateDownloaded) return;

    global.appQuitting = true;

    if (process.platform === "linux" && latestUpdateDownloaded.linuxTarballPath) {
        const installDir = getInstallDir();
        const updateFile = latestUpdateDownloaded.linuxTarballPath;
        try {
            const listResult = spawnSync("tar", ["-tvzf", updateFile], { stdio: "pipe", timeout: 30000 });
            if (listResult.status !== 0) {
                throw new Error(listResult.stderr.toString() || `tar list exited with code ${listResult.status}`);
            }
            validateVerboseTarListing(listResult.stdout.toString(), 1);

            console.log(`Extracting update to ${installDir}`);
            const result = spawnSync("tar", ["-xzf", updateFile, "-C", installDir, "--strip-components=1"], {
                stdio: "pipe",
                timeout: 30000,
            });
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

async function checkForLinuxTarballUpdate(manual: boolean): Promise<void> {
    if (checkingLinuxTarballUpdate) return;
    checkingLinuxTarballUpdate = true;

    try {
        const publicKeys = getBuildConfig().updateManifestPublicKeys;
        if (Object.keys(publicKeys).length === 0) {
            throw new Error("This build does not include Linux tar.gz update signing keys.");
        }

        const release = await requestJson<GitHubRelease>(getLatestReleaseUrl());
        if (release.draft || release.prerelease) {
            ipcChannelSendUpdateStatus(false);
            return;
        }

        const manifest = await requestJson<UpdateManifestEnvelope>(getManifestDownloadUrl(release.tag_name));
        const payload = verifyUpdateManifest(manifest, {
            currentVersion: app.getVersion(),
            platform: process.platform,
            allowedArchNames: artifactArchNamesForProcess(),
            publicKeys,
        });

        const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "element-desktop-update-"));
        const archivePath = path.join(
            tempDir,
            `element-desktop-${normaliseVersion(payload.version)}-linux-${payload.arch}.tar.gz`,
        );

        console.log(`Downloading signed Linux tar.gz update from ${payload.url}`);
        await downloadAndVerifyFile(payload.url, archivePath, {
            expectedSha512: payload.sha512,
            expectedSize: payload.size,
        });

        latestUpdateDownloaded = {
            releaseNotes: payload.releaseNotes ?? release.body ?? "",
            releaseName: normaliseVersion(payload.version),
            releaseDate: new Date(payload.releaseDate ?? release.published_at ?? Date.now()),
            updateURL: getReleasePage(payload.version),
            linuxTarballPath: archivePath,
            linuxTarballPayload: payload,
        };
        notifyDownloaded(latestUpdateDownloaded);
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.log("Couldn't check for Linux tar.gz update", e);
        ipcChannelSendUpdateStatus(manual ? error : false);
    } finally {
        checkingLinuxTarballUpdate = false;
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

    if (isLinuxTarballInstall()) {
        await checkForLinuxTarballUpdate(manual);
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

    if (isLinuxTarballInstall()) {
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
    .on("update-available", async () => {
        ipcChannelSendUpdateStatus(true);
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
