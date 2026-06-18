#!/usr/bin/env bash
#
# Builds a custom Element Call and places it where the Element Web build
# expects it (apps/web/.build/element-call/).
#
# Usage:
#   ./scripts/build-element-call.sh [path-to-element-call]
#
# If no path is given, it defaults to looking for element-call as a sibling
# of the element-web checkout (../element-call).
#
# The target directory must contain a valid element-call checkout with a
# package.json (the root element-call repo, NOT the embedded/web sub-package).
# The embedded build will be run automatically.

set -ex

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ELEMENT_CALL_SRC="${1:-$REPO_ROOT/../element-call}"
BUILD_DEST="$REPO_ROOT/apps/web/.build/element-call"

if [ ! -d "$ELEMENT_CALL_SRC" ]; then
    echo "Element Call source not found at $ELEMENT_CALL_SRC"
    echo "Provide a path to an element-call checkout, or ensure it exists as a sibling of element-web."
    exit 1
fi

if [ ! -f "$ELEMENT_CALL_SRC/package.json" ]; then
    echo "No package.json found in $ELEMENT_CALL_SRC — is this an element-call checkout?"
    exit 1
fi

echo "Building Element Call (embedded) from $ELEMENT_CALL_SRC"

# Install dependencies and build the embedded variant
pnpm --dir "$ELEMENT_CALL_SRC" install --frozen-lockfile
pnpm --dir "$ELEMENT_CALL_SRC" build:embedded

# Copy the built dist to the expected location
mkdir -p "$BUILD_DEST"
cp -r "$ELEMENT_CALL_SRC/dist/"* "$BUILD_DEST/"

echo "Element Call embedded build copied to $BUILD_DEST"
