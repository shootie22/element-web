/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";

export const UPDATE_MANIFEST_SCHEMA = 1;

export interface UpdateManifestEnvelope {
    schema: number;
    keyId: string;
    payload: string;
    signature: string;
}

export interface UpdateManifestPayload {
    schema: number;
    version: string;
    platform: "linux";
    arch: string;
    url: string;
    sha512: string;
    size: number;
    releaseDate?: string;
    releaseNotes?: string;
}

interface VerifyManifestOptions {
    currentVersion: string;
    platform: NodeJS.Platform;
    allowedArchNames: string[];
    publicKeys: Record<string, string>;
}

interface DownloadOptions {
    expectedSha512: string;
    expectedSize: number;
    /** Called as bytes arrive, with the number of bytes transferred so far and the expected total. */
    onProgress?: (transferred: number, total: number) => void;
}

export function normaliseVersion(version: string): string {
    return version.startsWith("v") ? version.slice(1) : version;
}

export function tagForVersion(version: string): string {
    return version.startsWith("v") ? version : `v${version}`;
}

function parseVersion(version: string): { parts: number[]; prerelease?: string } {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
    if (!match) {
        throw new Error(`Unsupported update version: ${version}`);
    }

    return {
        parts: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4],
    };
}

export function compareVersions(a: string, b: string): number {
    const parsedA = parseVersion(a);
    const parsedB = parseVersion(b);

    for (let i = 0; i < parsedA.parts.length; i++) {
        if (parsedA.parts[i] > parsedB.parts[i]) return 1;
        if (parsedA.parts[i] < parsedB.parts[i]) return -1;
    }

    if (!parsedA.prerelease && parsedB.prerelease) return 1;
    if (parsedA.prerelease && !parsedB.prerelease) return -1;
    if (!parsedA.prerelease && !parsedB.prerelease) return 0;
    return parsedA.prerelease!.localeCompare(parsedB.prerelease!);
}

export function artifactArchNamesForProcess(arch = process.arch): string[] {
    switch (arch) {
        case "x64":
            return ["x64", "x86_64", "amd64"];
        case "arm64":
            return ["arm64", "aarch64"];
        default:
            return [arch];
    }
}

function assertHttpsUrl(url: string): void {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
        throw new Error(`Update URL must use https: ${url}`);
    }
}

export function verifyUpdateManifest(
    manifest: UpdateManifestEnvelope,
    options: VerifyManifestOptions,
): UpdateManifestPayload {
    if (manifest.schema !== UPDATE_MANIFEST_SCHEMA) {
        throw new Error(`Unsupported update manifest schema: ${manifest.schema}`);
    }

    const publicKey = options.publicKeys[manifest.keyId];
    if (!publicKey) {
        throw new Error(`Unknown update manifest signing key: ${manifest.keyId}`);
    }

    const payloadBytes = Buffer.from(manifest.payload, "base64");
    const signature = Buffer.from(manifest.signature, "base64");
    const verified = crypto.verify(null, payloadBytes, publicKey, signature);
    if (!verified) {
        throw new Error("Update manifest signature verification failed");
    }

    const payload = JSON.parse(payloadBytes.toString("utf8")) as UpdateManifestPayload;
    if (payload.schema !== UPDATE_MANIFEST_SCHEMA) {
        throw new Error(`Unsupported update payload schema: ${payload.schema}`);
    }
    if (payload.platform !== options.platform) {
        throw new Error(`Update platform mismatch: ${payload.platform}`);
    }
    if (!options.allowedArchNames.includes(payload.arch)) {
        throw new Error(`Update architecture mismatch: ${payload.arch}`);
    }
    if (compareVersions(payload.version, options.currentVersion) <= 0) {
        throw new Error(`Update ${payload.version} is not newer than ${options.currentVersion}`);
    }
    if (!/^[a-f0-9]{128}$/i.test(payload.sha512)) {
        throw new Error("Update payload has an invalid SHA-512 digest");
    }
    if (!Number.isSafeInteger(payload.size) || payload.size <= 0) {
        throw new Error("Update payload has an invalid size");
    }
    assertHttpsUrl(payload.url);

    return payload;
}

export function validateArchiveEntryPath(entry: string, stripComponents = 1): void {
    if (entry.length === 0 || path.posix.isAbsolute(entry)) {
        throw new Error(`Unsafe update archive path: ${entry}`);
    }

    const strippedParts = entry
        .split("/")
        .slice(stripComponents)
        .filter((part) => part.length > 0 && part !== ".");
    if (strippedParts.length === 0) return;

    if (strippedParts.includes("..")) {
        throw new Error(`Unsafe update archive path: ${entry}`);
    }

    const normalised = path.posix.normalize(strippedParts.join("/"));
    if (
        normalised === "." ||
        path.posix.isAbsolute(normalised) ||
        normalised === ".." ||
        normalised.startsWith("../")
    ) {
        throw new Error(`Unsafe update archive path: ${entry}`);
    }
}

export function validateVerboseTarListing(listing: string, stripComponents = 1): void {
    for (const rawLine of listing.split("\n")) {
        const line = rawLine.trimEnd();
        if (!line) continue;

        const type = line[0];
        if (type !== "-" && type !== "d") {
            throw new Error(`Unsupported update archive entry type: ${line}`);
        }

        const match = /^.\S*\s+\S+\s+\d+\s+\S+\s+\S+\s+(.+)$/.exec(line);
        if (!match) {
            throw new Error(`Could not parse update archive listing: ${line}`);
        }
        validateArchiveEntryPath(match[1], stripComponents);
    }
}

export function requestJson<T>(url: string, redirects = 0): Promise<T> {
    if (redirects > 10) return Promise.reject(new Error("Too many redirects"));
    assertHttpsUrl(url);

    return new Promise((resolve, reject) => {
        const request = https.get(
            url,
            {
                headers: {
                    "Accept": "application/vnd.github+json, application/json",
                    "User-Agent": "Element-Desktop-Updater",
                },
            },
            (response) => {
                if (
                    response.statusCode != null &&
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {
                    response.resume();
                    resolve(requestJson(new URL(response.headers.location, url).toString(), redirects + 1));
                    return;
                }

                if (response.statusCode !== 200) {
                    response.resume();
                    reject(new Error(`Request failed: ${response.statusCode}`));
                    return;
                }

                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("end", () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
                    } catch (e) {
                        reject(e);
                    }
                });
            },
        );
        request.on("error", reject);
    });
}

export function downloadAndVerifyFile(
    url: string,
    dest: string,
    options: DownloadOptions,
    redirects = 0,
): Promise<void> {
    if (redirects > 10) return Promise.reject(new Error("Too many redirects"));
    assertHttpsUrl(url);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest, { flags: "wx", mode: 0o600 });
        const hash = crypto.createHash("sha512");
        let bytes = 0;

        const fail = (error: Error): void => {
            file.close();
            fs.unlink(dest, () => {});
            reject(error);
        };

        const request = https.get(url, (response) => {
            if (
                response.statusCode != null &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
            ) {
                response.resume();
                file.close();
                fs.unlink(dest, () => {});
                resolve(
                    downloadAndVerifyFile(
                        new URL(response.headers.location, url).toString(),
                        dest,
                        options,
                        redirects + 1,
                    ),
                );
                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                fail(new Error(`Download failed: ${response.statusCode}`));
                return;
            }

            response.on("data", (chunk: Buffer) => {
                bytes += chunk.length;
                hash.update(chunk);
                options.onProgress?.(bytes, options.expectedSize);
            });
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                const actualSha512 = hash.digest("hex");
                if (bytes !== options.expectedSize) {
                    fail(new Error(`Update size mismatch: expected ${options.expectedSize}, got ${bytes}`));
                    return;
                }
                if (actualSha512 !== options.expectedSha512.toLowerCase()) {
                    fail(new Error("Update SHA-512 verification failed"));
                    return;
                }
                resolve();
            });
        });
        request.on("error", fail);
        file.on("error", fail);
    });
}
