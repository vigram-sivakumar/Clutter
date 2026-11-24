#!/bin/bash
# Build an Apple Silicon beta installer without Apple Developer ID signing or notarisation.
# Requires the Tauri updater signing key; this is separate from Apple code signing.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

HOST_ARCH="$(uname -m)"
[ "$HOST_ARCH" = "arm64" ] || {
  echo "Apple Silicon beta builds must run on an Apple Silicon Mac (host: $HOST_ARCH)." >&2
  exit 1
}

RUST_HOST="$(rustc -vV | sed -n 's/^host: //p')"
case "$RUST_HOST" in
  aarch64-apple-darwin) ;;
  *) echo "Rust host target is $RUST_HOST; expected aarch64-apple-darwin." >&2; exit 1 ;;
esac

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "Set TAURI_SIGNING_PRIVATE_KEY to the updater key file path (and TAURI_SIGNING_PRIVATE_KEY_PASSWORD if required)." >&2
  exit 1
fi

"$HERE/check-atomic-default.sh"

TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
rm -rf "$TARGET/release/bundle/macos" "$TARGET/release/bundle/dmg"

VITE_CLUTTER_DIRECT_UPDATES=1 ../../node_modules/.bin/tauri build \
  --bundles app,dmg \
  --features direct-updates \
  --config src-tauri/tauri.direct-updates.conf.json

APP="$(find "$TARGET/release/bundle/macos" -maxdepth 1 -type d -name '*.app' -print -quit)"
[ -n "$APP" ] || { echo "Build did not produce a macOS app bundle." >&2; exit 1; }

echo "Built: $APP"
"$HERE/verify-bundle.sh" "$APP" --beta
node "$HERE/write-update-manifest.mjs"

echo
echo "Apple Silicon beta artefacts are ready. Nothing was uploaded."
echo "DMG:      $TARGET/release/bundle/dmg/*.dmg"
echo "Updater:  $TARGET/release/bundle/macos/*.app.tar.gz"
echo "Signature:$TARGET/release/bundle/macos/*.app.tar.gz.sig"
echo "Manifest: $TARGET/release/bundle/macos/latest.json"
