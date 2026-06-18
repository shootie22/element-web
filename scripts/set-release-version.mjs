#!/usr/bin/env node

/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import fs from "node:fs";

const inputVersion = process.argv[2];
if (!inputVersion) {
    throw new Error("Usage: set-release-version.mjs <vX.Y.Z | X.Y.Z>");
}

const match = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(inputVersion);
if (!match) {
    throw new Error(`Release version must look like vX.Y.Z or vX.Y.Z-prerelease: ${inputVersion}`);
}

const version = match[1];
const packagePaths = ["apps/web/package.json", "apps/desktop/package.json"];

for (const packagePath of packagePaths) {
    const original = fs.readFileSync(packagePath, "utf8");
    const packageJson = JSON.parse(original);
    packageJson.version = version;
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`);
    console.log(`${packagePath}: ${version}`);
}
