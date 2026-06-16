/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import {
    compareVersions,
    validateArchiveEntryPath,
    validateVerboseTarListing,
    verifyUpdateManifest,
    type UpdateManifestPayload,
} from "./linux-tarball-updater.js";

function signedManifest(payload: UpdateManifestPayload): {
    manifest: { schema: number; keyId: string; payload: string; signature: string };
    publicKeyPem: string;
} {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
    return {
        manifest: {
            schema: 1,
            keyId: "test-key",
            payload: payloadBytes.toString("base64"),
            signature: crypto.sign(null, payloadBytes, privateKey).toString("base64"),
        },
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
}

const basePayload: UpdateManifestPayload = {
    schema: 1,
    version: "1.12.25",
    platform: "linux",
    arch: "x64",
    url: "https://github.com/shootie22/element-web/releases/download/v1.12.25/element-desktop-1.12.25-linux-x64.tar.gz",
    sha512: "a".repeat(128),
    size: 42,
};

describe("linux tarball update manifests", () => {
    it("verifies a signed update manifest", () => {
        const { manifest, publicKeyPem } = signedManifest(basePayload);

        const payload = verifyUpdateManifest(manifest, {
            currentVersion: "1.12.24",
            platform: "linux",
            allowedArchNames: ["x64"],
            publicKeys: {
                "test-key": publicKeyPem,
            },
        });

        expect(payload.version).toBe("1.12.25");
    });

    it("rejects a tampered manifest payload", () => {
        const { manifest, publicKeyPem } = signedManifest(basePayload);
        manifest.payload = Buffer.from(JSON.stringify({ ...basePayload, size: 100 }), "utf8").toString("base64");

        expect(() =>
            verifyUpdateManifest(manifest, {
                currentVersion: "1.12.24",
                platform: "linux",
                allowedArchNames: ["x64"],
                publicKeys: {
                    "test-key": publicKeyPem,
                },
            }),
        ).toThrow("signature");
    });

    it("rejects non-upgrade versions", () => {
        const { manifest, publicKeyPem } = signedManifest({ ...basePayload, version: "1.12.24" });

        expect(() =>
            verifyUpdateManifest(manifest, {
                currentVersion: "1.12.24",
                platform: "linux",
                allowedArchNames: ["x64"],
                publicKeys: {
                    "test-key": publicKeyPem,
                },
            }),
        ).toThrow("not newer");
    });
});

describe("linux tarball archive validation", () => {
    it("allows normal electron-builder archive entries", () => {
        validateArchiveEntryPath("element-desktop-1.12.25/element-desktop", 1);
        validateArchiveEntryPath("element-desktop-1.12.25/resources/app.asar", 1);
    });

    it("rejects traversal entries after stripping the archive root", () => {
        expect(() => validateArchiveEntryPath("element-desktop-1.12.25/../owned", 1)).toThrow("Unsafe");
        expect(() => validateArchiveEntryPath("/element-desktop-1.12.25/owned", 1)).toThrow("Unsafe");
    });

    it("rejects symlinks and device-like entries from verbose tar output", () => {
        expect(() =>
            validateVerboseTarListing("lrwxrwxrwx user/group 0 2026-06-16 12:00 element/root -> /etc/passwd\n"),
        ).toThrow("entry type");
    });
});

describe("compareVersions", () => {
    it("orders stable and prerelease versions", () => {
        expect(compareVersions("1.12.25", "1.12.24")).toBe(1);
        expect(compareVersions("1.12.25-rc.1", "1.12.25")).toBe(-1);
    });
});
