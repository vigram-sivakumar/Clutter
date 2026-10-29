#!/bin/bash
# Runs the development app INSIDE the App Sandbox, to test the real behavior (Documents authorization on the first
# Create, security-scoped bookmarks for picked folders, unauthorized paths refused by the system) without packaging.
# Same code and the same entitlements as every packaged Clutter (src-tauri/Entitlements.plist); the only difference
# from a packaged app is that it loads the Vite dev server instead of a bundled frontend.
#
# `npm run tauri dev` stays unsandboxed (your whole home is available, which is convenient); use this when you need the
# sandbox. It does not touch a running `tauri dev`: it uses its own Vite port and its own cargo target directory.
#
#   DEV_SANDBOX_PORT   the Vite port (default 1422; `tauri dev` uses 1421)
#
# The sandboxed app keeps its data in ~/Library/Containers/<bundle id>/, apart from the unsandboxed dev app's.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/.."
cd "$APP_DIR"
PORT="${DEV_SANDBOX_PORT:-1422}"
TARGET="${CARGO_TARGET_DIR:-$APP_DIR/src-tauri/target-sandboxed}"

VITE_PORT="$PORT" ../../node_modules/.bin/vite > /tmp/clutter-dev-sandboxed-vite.log 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT" >/dev/null && break; sleep 0.5; done
curl -sf "http://localhost:$PORT" >/dev/null || { echo "The Vite dev server did not start on port $PORT (see /tmp/clutter-dev-sandboxed-vite.log)." >&2; exit 1; }

# A debug build loads the config's devUrl; point it at this port. The default features include the atomic writer.
CONFIG="{\"build\":{\"devUrl\":\"http://localhost:$PORT\"}}"
( cd src-tauri && CARGO_TARGET_DIR="$TARGET" TAURI_CONFIG="$CONFIG" cargo build )
BINARY="$TARGET/debug/app"

# The system only sandboxes an executable that lives in an app bundle (it needs the bundle identifier to find the
# container; a bare binary is killed at launch), so wrap the dev binary in a minimal bundle with the app's identifier.
IDENTIFIER=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['identifier'])")
BUNDLE="$TARGET/debug/Clutter-dev-sandboxed.app"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS"
cp "$BINARY" "$BUNDLE/Contents/MacOS/app"
cat > "$BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>$IDENTIFIER</string>
  <key>CFBundleExecutable</key><string>app</string>
  <key>CFBundleName</key><string>Clutter</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
</dict></plist>
PLIST

# Sign it with the same entitlements as every packaged Clutter, so the system sandboxes it. Ad hoc: local only.
codesign --force --deep --sign - --entitlements src-tauri/Entitlements.plist "$BUNDLE"
echo "running sandboxed as $IDENTIFIER ($BUNDLE); quit the app to stop"
"$BUNDLE/Contents/MacOS/app"
