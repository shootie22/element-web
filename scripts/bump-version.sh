#!/usr/bin/env bash

# Bumps the project version in every place it lives.
#
# The canonical version is stored in the top-level "version" field of the
# package.json files listed in VERSION_FILES below. Keep this list in sync if
# more files ever need the version.
#
# Usage:
#   scripts/bump-version.sh                # auto: latest vX.Y.Z tag, patch + 1
#   scripts/bump-version.sh 1.12.33        # set an explicit version (no leading v)
#   scripts/bump-version.sh --tag          # auto-bump, then git commit + tag vX.Y.Z
#   scripts/bump-version.sh 1.13.0 --tag   # explicit version, then commit + tag
#
# Never pushes. Review, then `git push --follow-tags` yourself.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Files carrying the canonical top-level "version" field.
VERSION_FILES=(apps/web/package.json apps/desktop/package.json)

DO_TAG=0
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --tag) DO_TAG=1 ;;
    -h|--help) sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) VERSION="$arg" ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  LATEST="$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)"
  if [[ -z "$LATEST" ]]; then echo "No vX.Y.Z tag found; pass a version explicitly." >&2; exit 1; fi
  IFS='.' read -r MA MI PA <<< "${LATEST#v}"
  VERSION="$MA.$MI.$((PA + 1))"
  echo "Latest tag: $LATEST  ->  next: v$VERSION"
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "Invalid version: '$VERSION' (expected X.Y.Z)" >&2; exit 1
fi

for f in "${VERSION_FILES[@]}"; do
  [[ -f "$f" ]] || { echo "Missing: $f" >&2; exit 1; }
  # Replace only the FIRST "version" field (the top-level one).
  NEW="$VERSION" perl -i -pe 'if (!$seen && /"version":/) { s/("version":\s*")[^"]*(")/$1$ENV{NEW}$2/; $seen=1 }' "$f"
  echo "  updated $f -> $VERSION"
done

if [[ "$DO_TAG" == "1" ]]; then
  git add "${VERSION_FILES[@]}"
  git commit -m "Bump version to $VERSION"
  git tag "v$VERSION"
  echo "Committed and tagged v$VERSION (not pushed). Push with: git push --follow-tags"
else
  echo "Files updated. Not committed/tagged. Re-run with --tag to do that automatically."
fi
