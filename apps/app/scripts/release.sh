#!/bin/bash
# One-command Clutter release workflow.
#   npm run release       Build a Developer ID signed/notarized release and publish it to Cloudflare R2.
#   npm run release:local Build and verify a local installer/update package without publishing it.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

MODE="${1:-production}"
case "$MODE" in
  local)
    "$HERE/check-atomic-default.sh"
    TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
    # Remove stale bundle outputs so manifest generation can only see artefacts from this build.
    rm -rf "$TARGET/release/bundle/macos" "$TARGET/release/bundle/dmg"

    VITE_CLUTTER_DIRECT_UPDATES=1 ../../node_modules/.bin/tauri build \
      --bundles app,dmg \
      --features direct-updates \
      --config src-tauri/tauri.direct-updates.conf.json

    APP=$(find "$TARGET/release/bundle/macos" -maxdepth 1 -type d -name '*.app' -print -quit)
    [ -n "$APP" ] || { echo "Build did not produce a macOS app bundle." >&2; exit 1; }
    "$HERE/verify-bundle.sh" "$APP" --local
    node "$HERE/write-update-manifest.mjs"

    echo
    echo "Local release artefacts are ready. Nothing was uploaded."
    echo "DMG:      $TARGET/release/bundle/dmg/"
    echo "Updater:  $TARGET/release/bundle/macos/*.app.tar.gz"
    echo "Signature:$TARGET/release/bundle/macos/*.app.tar.gz.sig"
    echo "Manifest: $TARGET/release/bundle/macos/latest.json"
    ;;
  production)
    npm run build:share
    npm run publish:update
    ;;
  *)
    echo "Usage: npm run release [-- local|production]" >&2
    exit 2
    ;;
esac
