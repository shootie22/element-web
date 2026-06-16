# Desktop Auto-Updater Plan

## Goals

- Keep GitHub Releases as the update source for Windows, AppImage, and tar.gz Linux builds.
- Make releases immutable: each tag produces one versioned set of assets, and the workflow must not edit or clobber an existing release.
- Support automatic updates for loose Linux tar.gz installs without trusting unsigned archives.
- Keep every release version anchored to the tag and validate that desktop and web package versions match it.

## Current Assessment

- Windows uses `electron-updater` with GitHub release metadata and the normal NSIS update flow. This is the closest part to a standard implementation.
- AppImage can use `electron-updater`, but the loose tar.gz build cannot. A tar.gz archive is not an auto-updatable Electron target by itself.
- The existing Linux tar.gz updater downloads a predictable archive URL, stores it in a temp path, and extracts it into the installation directory without any archive signature or digest verification. TLS and GitHub permissions are the only trust controls, which is not enough for a binary updater.
- The workflow currently edits existing releases and uploads assets with `--clobber`, so a version is not immutable.
- Versioning is split: the release tag, web package version, and desktop package version can diverge.

## Design

1. Windows and AppImage continue to use `electron-updater`.
2. Loose Linux tar.gz installs use a custom GitHub Release manifest:
    - The app discovers the latest release tag from GitHub.
    - It downloads `element-desktop-<version>-linux-<arch>.tar.gz.update.json`.
    - The manifest contains a base64 JSON payload plus an Ed25519 signature.
    - The payload binds the version, target platform, target architecture, archive URL, archive size, SHA-512 digest, and minimum updater schema.
    - The app verifies the manifest with a public key embedded at build time in packaged metadata.
    - The app downloads the archive to a private temporary directory, verifies byte size and SHA-512, validates archive paths, then extracts.
3. The release workflow signs tar.gz manifests only from CI using a private key secret.
4. The release workflow fails if the target GitHub release already exists.
5. The release workflow validates `vX.Y.Z` tags and ensures `apps/web/package.json` and `apps/desktop/package.json` match the normalized version.

## Required Release Secrets / Vars

- `UPDATE_MANIFEST_PRIVATE_KEY_PEM` or `UPDATE_MANIFEST_PRIVATE_KEY_BASE64`: Ed25519 private key used by CI to sign Linux tar.gz update manifests.
- `UPDATE_MANIFEST_PUBLIC_KEY_PEM`, `UPDATE_MANIFEST_PUBLIC_KEY_BASE64`, `UPDATE_MANIFEST_PUBLIC_KEYS_JSON`, or `UPDATE_MANIFEST_PUBLIC_KEYS_BASE64_JSON`: public key material embedded into the desktop build.
- Optional `UPDATE_MANIFEST_KEY_ID`: key identifier, default `github-release-v1`.

## Quick Wins Implemented First

- Stop release asset clobbering.
- Stop extracting unsigned Linux tar.gz archives.
- Remove hardcoded tarball updater trust in favor of signed manifests.
- Normalize release versions by stripping a leading `v` before building the web distribution.
- Add focused tests for manifest verification and tar path validation.
