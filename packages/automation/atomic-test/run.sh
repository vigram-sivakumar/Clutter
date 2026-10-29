#!/bin/bash
# Runs the atomic-save real-app specs against the isolated build in <scratch-dir> (see README.md). Serves the
# frontend on :15421 for the run, uses a throw-away HOME, and removes both afterwards.
set -euo pipefail
SCRATCH="${1:?usage: run.sh <scratch-dir> [spec-glob]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export CLUTTER_ATOMIC_TEST_BINARY="$SCRATCH/clutter-atomictest"
export CLUTTER_FAKE_HOME="/tmp/clutter-atomictest-home-$$"
[ -n "${2:-}" ] && export CLUTTER_ATOMIC_SPEC="$2"
rm -rf "$CLUTTER_FAKE_HOME"
mkdir -p "$CLUTTER_FAKE_HOME/Documents"
python3 -m http.server 15421 --directory "$SCRATCH/dist" >/dev/null 2>&1 &
SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null || true
  # Disposable volumes a spec mounted under the throw-away home, then the home itself.
  for mount in "$CLUTTER_FAKE_HOME"/Documents/*; do hdiutil detach -force "$mount" >/dev/null 2>&1 || true; done
  chflags -R nouchg "$CLUTTER_FAKE_HOME" 2>/dev/null || true
  chmod -R u+rwx "$CLUTTER_FAKE_HOME" 2>/dev/null || true
  rm -rf "$CLUTTER_FAKE_HOME"
}
trap cleanup EXIT
sleep 1
cd "$HERE/.." && npx wdio run atomic-test/wdio.atomic.conf.ts
