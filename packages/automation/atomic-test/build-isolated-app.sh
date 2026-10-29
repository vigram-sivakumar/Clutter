#!/bin/bash
# Builds the isolated atomic-save test application into <scratch-dir>. Never touches apps/app/dist, the default cargo
# target dir, or a running `tauri dev`.
set -euo pipefail
SCRATCH="${1:?usage: build-isolated-app.sh <scratch-dir> [frontend-atomic: true|false] [rust-atomic: true|false]}"
# The two switches are independent build-time decisions; the test matrix builds every combination (see
# specs/build-matrix.spec.ts). Defaults: both on.
FRONTEND_ATOMIC="${2:-true}"
RUST_ATOMIC="${3:-true}"
FEATURES="automation"
[ "$RUST_ATOMIC" = "true" ] && FEATURES="automation,atomic-writes"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../../apps/app"
mkdir -p "$SCRATCH"

(cd "$APP" && VITE_ATOMIC_WRITES="$FRONTEND_ATOMIC" npx vite build --outDir "$SCRATCH/dist" --emptyOutDir)

CONFIG='{
  "productName": "Clutter Atomic Test",
  "identifier": "com.clutter.atomictest",
  "build": { "devUrl": "http://localhost:15421" },
  "app": { "windows": [ {
    "title": "Clutter (atomic test, disposable)", "hiddenTitle": true, "titleBarStyle": "Overlay",
    "trafficLightPosition": { "x": 16, "y": 32 }, "width": 1020, "height": 920, "minWidth": 600, "minHeight": 500,
    "resizable": true, "fullscreen": false, "visible": false } ] }
}'
(cd "$APP/src-tauri" && CARGO_TARGET_DIR="${CARGO_TARGET_ROOT:-$SCRATCH}/target-rust-$RUST_ATOMIC" TAURI_CONFIG="$CONFIG" \
  cargo build --features "$FEATURES")
cp "${CARGO_TARGET_ROOT:-$SCRATCH}/target-rust-$RUST_ATOMIC/debug/app" "$SCRATCH/clutter-atomictest"
echo "built: $SCRATCH/clutter-atomictest (frontend atomic=$FRONTEND_ATOMIC, rust atomic=$RUST_ATOMIC)"
