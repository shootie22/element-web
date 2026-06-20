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
    compareVersions,
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
    /** True for updates produced by the dev simulator; install must never touch the real install. */
    simulated?: boolean;
}

/** An update that has been found but NOT yet downloaded. The download happens on the user's request. */
interface DiscoveredUpdate {
    releaseName: string;
    releaseDate: Date;
    releaseNotes: string;
    updateURL: string;
    /** Present for the Linux tar.gz path: everything needed to download on demand. */
    tarballPayload?: UpdateManifestPayload;
}

interface GitHubRelease {
    tag_name: string;
    body?: string;
    published_at?: string;
    draft?: boolean;
    prerelease?: boolean;
}

interface UpdateInfoResult {
    currentVersion: string;
    currentReleaseDate?: string;
    latestVersion?: string;
    latestReleaseDate?: string;
    status: "available" | "downloaded" | "uptodate" | "unsupported" | "unknown";
}

let started = false;
let discoveredUpdate: DiscoveredUpdate | undefined;
let latestUpdateDownloaded: ICachedUpdate | undefined;
let checkingForUpdate = false;
let downloadingUpdate = false;
let simulating = false;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function bumpPatch(version: string): string {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!match) return `${version}-next`;
    return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

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

function getReleaseByTagUrl(tag: string): string {
    return `https://api.github.com/repos/shootie22/element-web/releases/tags/${tag}`;
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

// --- Renderer notification helpers -------------------------------------------------

function sendCheckStatus(status: boolean | string): void {
    global.mainWindow?.webContents.send("check_updates", status);
}

function sendAvailable(update: DiscoveredUpdate): void {
    global.mainWindow?.webContents.send("update-available", {
        releaseName: update.releaseName,
        releaseDate: update.releaseDate,
        releaseNotes: update.releaseNotes,
        updateURL: update.updateURL,
    });
}

function sendProgress(percent: number, transferred: number, total: number, bytesPerSecond?: number): void {
    global.mainWindow?.webContents.send("update-download-progress", { percent, transferred, total, bytesPerSecond });
}

function sendLog(message: string, level: "info" | "warn" | "error" = "info"): void {
    global.mainWindow?.webContents.send("update-log", { ts: Date.now(), level, message });
}

function sendError(phase: string, message: string): void {
    global.mainWindow?.webContents.send("update-error", { phase, message });
}

function notifyDownloaded(update: ICachedUpdate): void {
    global.mainWindow?.webContents.send("update-downloaded", update);
}

// --- Install -----------------------------------------------------------------------

function installUpdate(): void {
    if (simulating) {
        // Safety: simulated runs must never extract over the real install or relaunch.
        sendLog("[SIMULATION] Restart requested — the app would relaunch into the new version now.", "info");
        console.log("[updater] simulated install_update: skipping real restart");
        simulating = false;
        return;
    }

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
            sendError("install", e instanceof Error ? e.message : String(e));
        }
    } else {
        autoUpdater.quitAndInstall();
    }
}

// --- Discovery (no download) -------------------------------------------------------

async function discoverLinuxTarballUpdate(): Promise<void> {
    const publicKeys = getBuildConfig().updateManifestPublicKeys;
    if (Object.keys(publicKeys).length === 0) {
        throw new Error("This build does not include Linux tar.gz update signing keys.");
    }

    const release = await requestJson<GitHubRelease>(getLatestReleaseUrl());
    if (release.draft || release.prerelease || compareVersions(release.tag_name, app.getVersion()) <= 0) {
        discoveredUpdate = undefined;
        sendCheckStatus(false);
        return;
    }

    const manifest = await requestJson<UpdateManifestEnvelope>(getManifestDownloadUrl(release.tag_name));
    const payload = verifyUpdateManifest(manifest, {
        currentVersion: app.getVersion(),
        platform: process.platform,
        allowedArchNames: artifactArchNamesForProcess(),
        publicKeys,
    });

    discoveredUpdate = {
        releaseName: normaliseVersion(payload.version),
        releaseDate: new Date(payload.releaseDate ?? release.published_at ?? Date.now()),
        releaseNotes: payload.releaseNotes ?? release.body ?? "",
        updateURL: getReleasePage(payload.version),
        tarballPayload: payload,
    };
    sendAvailable(discoveredUpdate);
}

async function checkForUpdates(manual = false): Promise<void> {
    if (!available()) {
        if (manual) sendCheckStatus("Auto update is not supported for this build.");
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

    if (checkingForUpdate) return;
    checkingForUpdate = true;
    try {
        if (isLinuxTarballInstall()) {
            await discoverLinuxTarballUpdate();
        } else {
            // electron-updater discovers (autoDownload is off); the download-progress and
            // update-downloaded events are wired up at the bottom of this module.
            await autoUpdater.checkForUpdates();
        }
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.log("Couldn't check for update", e);
        sendCheckStatus(manual ? error : false);
    } finally {
        checkingForUpdate = false;
    }
}

async function automaticCheckForUpdates(): Promise<void> {
    await checkForUpdates(false);
}

async function manualCheckForUpdates(): Promise<void> {
    await checkForUpdates(true);
}

// --- Download on demand ------------------------------------------------------------

async function downloadDiscoveredTarball(update: DiscoveredUpdate): Promise<void> {
    const payload = update.tarballPayload!;
    const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "element-desktop-update-"));
    const archivePath = path.join(
        tempDir,
        `element-desktop-${normaliseVersion(payload.version)}-linux-${payload.arch}.tar.gz`,
    );

    sendLog(`Downloading ${update.releaseName} (${payload.arch})…`);
    let lastLoggedPct = -1;
    await downloadAndVerifyFile(payload.url, archivePath, {
        expectedSha512: payload.sha512,
        expectedSize: payload.size,
        onProgress: (transferred, total) => {
            const percent = total > 0 ? transferred / total : 0;
            sendProgress(percent, transferred, total);
            const pct = Math.floor(percent * 100);
            if (pct >= lastLoggedPct + 10) {
                sendLog(`Downloading… ${pct}%`);
                lastLoggedPct = pct;
            }
        },
    });

    sendLog("Verifying signature and checksum… ✓");
    sendLog("Update downloaded and ready to install.");
    latestUpdateDownloaded = {
        releaseNotes: update.releaseNotes,
        releaseName: update.releaseName,
        releaseDate: update.releaseDate,
        updateURL: update.updateURL,
        linuxTarballPath: archivePath,
        linuxTarballPayload: payload,
    };
    notifyDownloaded(latestUpdateDownloaded);
}

async function startUpdateDownload(): Promise<void> {
    if (simulating) return; // the simulator drives its own progress
    if (latestUpdateDownloaded) {
        notifyDownloaded(latestUpdateDownloaded);
        return;
    }
    if (downloadingUpdate) return;
    downloadingUpdate = true;
    try {
        if (discoveredUpdate?.tarballPayload) {
            await downloadDiscoveredTarball(discoveredUpdate);
        } else if (!isLinuxTarballInstall()) {
            // electron-updater (AppImage/Windows): progress arrives via "download-progress",
            // completion via "update-downloaded".
            sendLog("Downloading update…");
            await autoUpdater.downloadUpdate();
        } else {
            sendError("download", "No update available to download. Check for updates first.");
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Failed to download update", e);
        sendError("download", message);
    } finally {
        downloadingUpdate = false;
    }
}

// --- Version info for the settings panel -------------------------------------------

async function getUpdateInfo(): Promise<UpdateInfoResult> {
    const currentVersion = normaliseVersion(app.getVersion());

    let currentReleaseDate: string | undefined;
    try {
        const current = await requestJson<GitHubRelease>(getReleaseByTagUrl(tagForVersion(app.getVersion())));
        currentReleaseDate = current.published_at;
    } catch {
        // Best effort; the current build's release may not be queryable.
    }

    if (!available()) {
        return { currentVersion, currentReleaseDate, status: "unsupported" };
    }
    if (latestUpdateDownloaded) {
        return {
            currentVersion,
            currentReleaseDate,
            latestVersion: normaliseVersion(latestUpdateDownloaded.releaseName),
            latestReleaseDate: latestUpdateDownloaded.releaseDate.toISOString(),
            status: "downloaded",
        };
    }
    if (discoveredUpdate) {
        return {
            currentVersion,
            currentReleaseDate,
            latestVersion: normaliseVersion(discoveredUpdate.releaseName),
            latestReleaseDate: discoveredUpdate.releaseDate.toISOString(),
            status: "available",
        };
    }
    try {
        const release = await requestJson<GitHubRelease>(getLatestReleaseUrl());
        const newer = compareVersions(release.tag_name, app.getVersion()) > 0;
        return {
            currentVersion,
            currentReleaseDate,
            latestVersion: normaliseVersion(release.tag_name),
            latestReleaseDate: release.published_at,
            status: newer ? "available" : "uptodate",
        };
    } catch {
        return { currentVersion, currentReleaseDate, status: "unknown" };
    }
}

// --- Dev-only simulator ------------------------------------------------------------

interface SimulateArgs {
    mode?: "events" | "file";
    scenario?: "success" | "slow" | "error" | "verify-fail";
    sizeBytes?: number;
}

async function simulateUpdate(args: SimulateArgs): Promise<void> {
    const scenario = args.scenario ?? "success";
    const slow = scenario === "slow";
    const total = args.sizeBytes ?? 48 * 1024 * 1024;

    simulating = true;
    discoveredUpdate = undefined;
    latestUpdateDownloaded = undefined;

    sendLog(`[SIMULATION] Starting simulated update (scenario: ${scenario}).`);
    sendLog("Checking for updates…");
    await delay(slow ? 700 : 250);

    const fakeVersion = bumpPatch(normaliseVersion(app.getVersion()));
    const notes = `Simulated release notes for ${fakeVersion}.\n\n- Example change one\n- Example change two\n- Example change three`;
    sendAvailable({
        releaseName: fakeVersion,
        releaseDate: new Date(),
        releaseNotes: notes,
        updateURL: getReleasePage(fakeVersion),
    });
    sendLog(`Found ${fakeVersion}.`);

    const steps = 20;
    const stepDelay = slow ? 500 : 130;
    const failAt = scenario === "error" ? Math.floor(steps * 0.45) : -1;
    for (let i = 1; i <= steps; i++) {
        await delay(stepDelay);
        if (i === failAt) {
            sendError("download", "[SIMULATION] Network error while downloading the update.");
            sendLog("Download failed.", "error");
            simulating = false;
            return;
        }
        const transferred = Math.floor((i / steps) * total);
        sendProgress(i / steps, transferred, total, total / (steps * (stepDelay / 1000)));
        if (i % 4 === 0) sendLog(`Downloading… ${Math.floor((i / steps) * 100)}%`);
    }

    sendLog("Verifying signature and checksum…");
    await delay(slow ? 700 : 250);
    if (scenario === "verify-fail") {
        sendError("verify", "[SIMULATION] Signature verification failed.");
        sendLog("Verification failed.", "error");
        simulating = false;
        return;
    }

    sendLog("Update downloaded and ready to install.");
    // NB: we deliberately do NOT set latestUpdateDownloaded to a real tarball path —
    // install_update is a guarded no-op while `simulating` is true.
    notifyDownloaded({
        releaseNotes: notes,
        releaseName: fakeVersion,
        releaseDate: new Date(),
        updateURL: getReleasePage(fakeVersion),
        simulated: true,
    });
}

// --- Lifecycle + IPC ---------------------------------------------------------------

export async function start(): Promise<void> {
    if (started) return;
    started = true;

    if (!available()) {
        console.warn("Auto update not supported for this build");
        return;
    }

    console.log("Starting GitHub Releases auto update");

    // Downloads and installs are user-initiated for both paths: we discover in the
    // background, notify, and only download/restart when the user asks (so the UI can
    // show progress and gate the Restart button).
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    setTimeout(automaticCheckForUpdates, INITIAL_UPDATE_DELAY_MS);
    setInterval(automaticCheckForUpdates, UPDATE_POLL_INTERVAL_MS);
}

ipcMain.on("install_update", installUpdate);
ipcMain.on("check_updates", manualCheckForUpdates);
ipcMain.on("start_update_download", () => void startUpdateDownload());
ipcMain.on("simulate_update", (_event, args: SimulateArgs | undefined) => void simulateUpdate(args ?? {}));
ipcMain.handle("get_update_info", () => getUpdateInfo());

autoUpdater
    .on("update-available", (info: UpdateInfo) => {
        discoveredUpdate = {
            releaseName: normaliseVersion(info.version),
            releaseDate: info.releaseDate ? new Date(info.releaseDate) : new Date(),
            releaseNotes: normaliseReleaseNotes(info.releaseNotes),
            updateURL: getReleasePage(info.version),
        };
        sendAvailable(discoveredUpdate);
    })
    .on("update-not-available", function () {
        if (latestUpdateDownloaded) {
            notifyDownloaded(latestUpdateDownloaded);
        } else {
            sendCheckStatus(false);
        }
    })
    .on("download-progress", (progress) => {
        sendProgress((progress.percent ?? 0) / 100, progress.transferred, progress.total, progress.bytesPerSecond);
    })
    .on("error", function (error) {
        sendCheckStatus(error.message);
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
