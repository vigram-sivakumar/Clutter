#!/bin/bash
# Build the updater-free universal App Store code path without Apple credentials.
# This is deliberately NOT a signed App Store submission or an upload.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
rustup target add aarch64-apple-darwin x86_64-apple-darwin
export CARGO_TARGET_DIR="$PWD/src-tauri/target/appstore-preflight"
(
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
  APPLE_SIGNING_IDENTITY=- VITE_CLUTTER_SPARKLE_UPDATES=0 ../../node_modules/.bin/tauri build --target universal-apple-darwin --bundles app
)
"$HERE/verify-bundle.sh" "$CARGO_TARGET_DIR/universal-apple-darwin/release/bundle/macos/Clutter.app" --appstore-preflight
echo 'App Store code-path preflight passed. No Apple distribution credentials were used and nothing was uploaded.'
