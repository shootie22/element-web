/*
Copyright 2016-2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { app, ipcMain } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";

import Store from "./store.js";

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

export function getPendingUpdate(): ICachedUpdate | undefined {
    return latestUpdateDownloaded;
}

export function automaticUpdatesEnabled(): boolean {
    return Store.instance?.get(AUTO_UPDATE_SETTING) !== false;
}

export function available(): boolean {
    if (!app.isPackaged) return false;

    if (process.platform === "win32") return true;
    if (process.platform === "linux") return Boolean(process.env.APPIMAGE);

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

    // for some reason, quitAndInstall does not fire the
    // before-quit event, so we need to set the flag here.
    global.appQuitting = true;
    autoUpdater.quitAndInstall();
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

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    console.log("Starting GitHub Releases auto update");

    if (!available()) {
        console.warn("Auto update not supported for this build");
        return;
    }

    setTimeout(automaticCheckForUpdates, INITIAL_UPDATE_DELAY_MS);
    setInterval(automaticCheckForUpdates, UPDATE_POLL_INTERVAL_MS);
}

ipcMain.on("install_update", installUpdate);
ipcMain.on("check_updates", manualCheckForUpdates);

autoUpdater
    .on("update-available", function () {
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
