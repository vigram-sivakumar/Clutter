#!/bin/bash
# Builds the isolated atomic-save test application into <scratch-dir>. Never touches apps/app/dist, the default cargo
# target dir, or a running `tauri dev`.
set -euo pipefail
SCRATCH="${1:?usage: build-isolated-app.sh <scratch-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../../../apps/app"
mkdir -p "$SCRATCH"

(cd "$APP" && VITE_ATOMIC_WRITES=true npx vite build --outDir "$SCRATCH/dist" --emptyOutDir)

CONFIG='{
  "productName": "Clutter Atomic Test",
  "identifier": "com.clutter.atomictest",
  "build": { "devUrl": "http://localhost:15421" },
  "app": { "windows": [ {
    "title": "Clutter (atomic test, disposable)", "hiddenTitle": true, "titleBarStyle": "Overlay",
    "trafficLightPosition": { "x": 16, "y": 32 }, "width": 1020, "height": 920, "minWidth": 600, "minHeight": 500,
    "resizable": true, "fullscreen": false, "visible": false } ] }
}'
(cd "$APP/src-tauri" && CARGO_TARGET_DIR="$SCRATCH/target" TAURI_CONFIG="$CONFIG" \
  cargo build --features automation,atomic-writes)
cp "$SCRATCH/target/debug/app" "$SCRATCH/clutter-atomictest"
echo "built: $SCRATCH/clutter-atomictest (frontend: $SCRATCH/dist)"
