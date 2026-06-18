# AGENTS.md

Notes for anyone (human or AI) working on this custom fork of element-hq/element-web.

## Dependencies: matrix-js-sdk is pinned via the lockfile — don't float it

`apps/web/package.json` declares the SDK as a **moving branch**:

```json
"matrix-js-sdk": "github:matrix-org/matrix-js-sdk#develop"
```

`#develop` is not a fixed version. The actual pin lives in `pnpm-lock.yaml`, which
records the exact commit (e.g. `.../tar.gz/501df744...`). We deliberately keep this
pinned to the **same commit upstream element-web tests against**, because the live
`develop` HEAD is frequently broken (type errors in the SDK itself).

**Rule: always install with `--frozen-lockfile`.**

```bash
pnpm install --frozen-lockfile
```

A bare `pnpm install` (or `--lockfile-only`) re-resolves `#develop` to its current
HEAD and can silently upgrade you to a broken SDK. If you must regenerate the
lockfile, re-pin the SDK afterwards:

1. Temporarily set `package.json` to the exact commit: `github:matrix-org/matrix-js-sdk#<sha>`
2. `pnpm install --lockfile-only`
3. Revert `package.json` back to `#develop` and fix the matching `specifier:` line in `pnpm-lock.yaml`
4. Validate: `pnpm install --frozen-lockfile`

Use the `<sha>` that `upstream/develop`'s `pnpm-lock.yaml` currently uses.

## Merging upstream

- Merge `upstream/develop` as a unit in an isolated worktree; keep `main` clean until verified.
- Conflicts concentrate in the custom desktop auto-updater
  (`apps/desktop/src/{updater,ipc,electron-main}.ts`, `apps/desktop/package.json`) and the lockfile.
  The fork uses a Linux/GitHub `electron-updater` flow (no-arg `updater.start()`), removed
  `electron-builder-squirrel-windows`, and added `electron-updater` — preserve these on conflict.

## Release convention: always call out the upstream sync 🔄

Whenever a release includes an upstream merge, the GitHub release notes **must say so**,
prefixed with the 🔄 emoji, framing the build as **upstream + our enhancements** (at least
as current as official Element, often ahead). This is a standing convention.

**This is automated — do NOT create releases by hand.** Releases are built and published
by the `.github/workflows/github-release-clients.yaml` pipeline, which triggers on `v*`
tag push, builds the web/Linux/Windows assets, and creates the release with those assets
attached. Its "Generate release notes" step auto-detects an upstream-sync merge in the
release's commit range (a merge commit whose subject matches `Merge upstream/develop`) and
prepends the 🔄 callout with the merged commit count and the upstream sync point. Example:

> 🔄 **Synced with upstream:** merged 39 commits from element-hq/element-web `develop`
> up to `90fb221a8e` (2026-06-18). This build is up to date with upstream plus our
> custom enhancements — upstream + ours.

For this to work, keep the upstream merge commit's subject starting with
`Merge upstream/develop` (that's how the pipeline detects the sync). Never create a release
manually via `gh`/the API — the publish job treats releases as immutable and will fail if
one already exists for the tag.

## Verification gates (current state)

- **`pnpm lint:types`** is the primary gate. Note it is NOT clean on `main` — it already
  reports SDK-source errors (re `@matrix-org/matrix-sdk-crypto-wasm`) that are environmental,
  not ours. A merge is fine if it's **no worse than `main`**.
- **Jest is currently broken locally** on every branch (`SyntaxError` on matrix-js-sdk
  `.ts`-extension imports). Pre-existing; tracked as a TODO. Don't treat a jest failure as a
  merge regression until that's fixed.
