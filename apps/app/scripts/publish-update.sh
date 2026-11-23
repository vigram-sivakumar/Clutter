#!/bin/bash
# Publish a completed, signed and notarized Clutter release to the private R2 bucket.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
MACOS_DIR="$TARGET/release/bundle/macos"
DMG_DIR="$TARGET/release/bundle/dmg"
MANIFEST="$MACOS_DIR/latest.json"
WRANGLER="$HERE/../../../workers/updates/node_modules/.bin/wrangler"
WRANGLER_CONFIG="$HERE/../../../workers/updates/wrangler.toml"

[ -f "$MANIFEST" ] || {
  echo "Missing $MANIFEST. Run npm run build:share first." >&2
  exit 1
}

ARCHIVE=$(find "$MACOS_DIR" -maxdepth 1 -name '*.app.tar.gz' -print -quit)
DMG=$(find "$DMG_DIR" -maxdepth 1 -name '*.dmg' -print -quit)

[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || {
  echo "Missing Tauri updater archive in $MACOS_DIR" >&2
  exit 1
}

[ -n "$DMG" ] && [ -f "$DMG" ] || {
  echo "Missing DMG in $DMG_DIR" >&2
  exit 1
}

[ -f "${ARCHIVE}.sig" ] || {
  echo "Missing updater signature: ${ARCHIVE}.sig" >&2
  exit 1
}

[ -x "$WRANGLER" ] || {
  echo "Wrangler not found. Install dependencies in workers/updates first." >&2
  exit 1
}

[ -f "$WRANGLER_CONFIG" ] || {
  echo "Wrangler config not found: $WRANGLER_CONFIG" >&2
  exit 1
}

echo "Uploading updater archive..."
"$WRANGLER" --config "$WRANGLER_CONFIG" r2 object put "clutter-releases/releases/$(basename "$ARCHIVE")" \
  --file "$ARCHIVE" \
  --content-type "application/gzip" \
  --remote

echo "Uploading DMG..."
"$WRANGLER" --config "$WRANGLER_CONFIG" r2 object put "clutter-releases/releases/$(basename "$DMG")" \
  --file "$DMG" \
  --content-type "application/x-apple-diskimage" \
  --remote

echo "Uploading manifest last..."
"$WRANGLER" --config "$WRANGLER_CONFIG" r2 object put "clutter-releases/latest.json" \
  --file "$MANIFEST" \
  --content-type "application/json" \
  --cache-control "no-store, max-age=0" \
  --remote

echo "Published release manifest and artifacts to Cloudflare R2."
