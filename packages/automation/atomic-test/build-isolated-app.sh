#!/bin/bash
# Builds the isolated atomic-save test application into <scratch-dir>. Never touches apps/app/dist, the default cargo
# target dir, or a running `tauri dev`.
set -euo pipefail
SCRATCH="${1:?usage: build-isolated-app.sh <scratch-dir> [native-writer: true|false]}"
# Atomic saves are the only saving system (ADR-063), so there is no interface switch. The one build-time variable left is
# whether the native writer is compiled in (the default `atomic-writes` feature): `false` builds without it to prove the
# app then refuses to open a Space rather than save with the plugin writer (specs/build-matrix.spec.ts). Default: true.
NATIVE_WRITER="${2:-true}"
FEATURES="automation"
CARGO_FLAGS=()
[ "$NATIVE_WRITER" = "true" ] || CARGO_FLAGS=(--no-default-features)
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../../apps/app"
mkdir -p "$SCRATCH"

(cd "$APP" && npx vite build --outDir "$SCRATCH/dist" --emptyOutDir)

CONFIG='{
  "productName": "Clutter Atomic Test",
  "identifier": "com.clutter.atomictest",
  "build": { "devUrl": "http://localhost:15421" },
  "app": { "windows": [ {
    "title": "Clutter (atomic test, disposable)", "hiddenTitle": true, "titleBarStyle": "Overlay",
    "trafficLightPosition": { "x": 16, "y": 32 }, "width": 1020, "height": 920, "minWidth": 600, "minHeight": 500,
    "resizable": true, "fullscreen": false, "visible": false } ] }
}'
(cd "$APP/src-tauri" && CARGO_TARGET_DIR="${CARGO_TARGET_ROOT:-$SCRATCH}/target-native-$NATIVE_WRITER" TAURI_CONFIG="$CONFIG" \
  cargo build "${CARGO_FLAGS[@]+"${CARGO_FLAGS[@]}"}" --features "$FEATURES")
cp "${CARGO_TARGET_ROOT:-$SCRATCH}/target-native-$NATIVE_WRITER/debug/app" "$SCRATCH/clutter-atomictest"
echo "built: $SCRATCH/clutter-atomictest (native writer=$NATIVE_WRITER)"
