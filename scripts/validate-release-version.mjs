#!/usr/bin/env node

/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import fs from "node:fs";

const tag = process.argv[2] ?? process.env.RELEASE_TAG;
if (!tag) {
    throw new Error("Usage: validate-release-version.mjs <release-tag>");
}

const match = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (!match) {
    throw new Error(`Release tag must look like vX.Y.Z or vX.Y.Z-prerelease: ${tag}`);
}

const releaseVersion = match[1];
const packagePaths = ["apps/web/package.json", "apps/desktop/package.json"];

for (const packagePath of packagePaths) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (packageJson.version !== releaseVersion) {
        throw new Error(`${packagePath} version ${packageJson.version} does not match release ${releaseVersion}`);
    }
}

console.log(releaseVersion);
