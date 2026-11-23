#!/bin/bash
# Publish a completed, signed and notarized Clutter release to the private R2 bucket.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
MACOS_DIR="$TARGET/release/bundle/macos"
DMG_DIR="$TARGET/release/bundle/dmg"
MANIFEST="$MACOS_DIR/latest.json"
[ -f "$MANIFEST" ] || { echo "Missing $MANIFEST. Run npm run build:share first." >&2; exit 1; }
ARCHIVE=$(find "$MACOS_DIR" -maxdepth 1 -name '*.app.tar.gz' -print -quit)
DMG=$(find "$DMG_DIR" -maxdepth 1 -name '*.dmg' -print -quit)
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "Missing Tauri updater archive in $MACOS_DIR" >&2; exit 1; }
[ -n "$DMG" ] && [ -f "$DMG" ] || { echo "Missing DMG in $DMG_DIR" >&2; exit 1; }
[ -f "${ARCHIVE}.sig" ] || { echo "Missing updater signature: ${ARCHIVE}.sig" >&2; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "npm/npx is required." >&2; exit 1; }
echo "Uploading updater archive..."
npx wrangler r2 object put "clutter-releases/releases/$(basename "$ARCHIVE")" --file "$ARCHIVE" --content-type "application/gzip" --remote
echo "Uploading DMG..."
npx wrangler r2 object put "clutter-releases/releases/$(basename "$DMG")" --file "$DMG" --content-type "application/x-apple-diskimage" --remote
echo "Uploading manifest last..."
npx wrangler r2 object put "clutter-releases/latest.json" --file "$MANIFEST" --content-type "application/json" --cache-control "no-store, max-age=0" --remote
echo "Published release manifest and artifacts to Cloudflare R2."
