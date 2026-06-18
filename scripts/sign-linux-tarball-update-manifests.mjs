#!/usr/bin/env node

/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i], process.argv[i + 1]);
}

const assetsDir = args.get("--assets-dir") ?? "release-assets";
const releaseTag = args.get("--release-tag") ?? process.env.RELEASE_TAG;
const repository = args.get("--repository") ?? process.env.GITHUB_REPOSITORY;
const keyId = process.env.UPDATE_MANIFEST_KEY_ID || "github-release-v1";
const privateKeyPem =
    process.env.UPDATE_MANIFEST_PRIVATE_KEY_PEM ||
    (process.env.UPDATE_MANIFEST_PRIVATE_KEY_BASE64
        ? Buffer.from(process.env.UPDATE_MANIFEST_PRIVATE_KEY_BASE64, "base64").toString("utf8")
        : undefined);

if (!releaseTag) throw new Error("Missing --release-tag or RELEASE_TAG");
if (!repository) throw new Error("Missing --repository or GITHUB_REPOSITORY");
if (!privateKeyPem) {
    throw new Error("Missing UPDATE_MANIFEST_PRIVATE_KEY_PEM or UPDATE_MANIFEST_PRIVATE_KEY_BASE64");
}

const version = releaseTag.startsWith("v") ? releaseTag.slice(1) : releaseTag;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Unsupported release tag: ${releaseTag}`);
}

const releaseNotesPath = path.join(process.cwd(), "RELEASE_NOTES.md");
const releaseNotes = fs.existsSync(releaseNotesPath) ? fs.readFileSync(releaseNotesPath, "utf8") : undefined;
const privateKey = crypto.createPrivateKey(privateKeyPem);
const tarballs = fs.readdirSync(assetsDir).filter((file) => /^element-desktop-.+-linux-.+\.tar\.gz$/.test(file));

if (tarballs.length === 0) {
    throw new Error(`No Linux desktop tar.gz assets found in ${assetsDir}`);
}

for (const file of tarballs) {
    const archMatch = /^element-desktop-.+-linux-(.+)\.tar\.gz$/.exec(file);
    if (!archMatch) continue;

    const assetPath = path.join(assetsDir, file);
    const archive = fs.readFileSync(assetPath);
    const payload = {
        schema: 1,
        version,
        platform: "linux",
        arch: archMatch[1],
        url: `https://github.com/${repository}/releases/download/${releaseTag}/${encodeURIComponent(file)}`,
        sha512: crypto.createHash("sha512").update(archive).digest("hex"),
        size: archive.length,
        releaseDate: new Date().toISOString(),
        releaseNotes,
    };

    const payloadJson = JSON.stringify(payload);
    const payloadBytes = Buffer.from(payloadJson, "utf8");
    const manifest = {
        schema: 1,
        keyId,
        payload: payloadBytes.toString("base64"),
        signature: crypto.sign(null, payloadBytes, privateKey).toString("base64"),
    };

    const manifestPath = `${assetPath}.update.json`;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    console.log(`Wrote ${manifestPath}`);
}
