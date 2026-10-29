#!/bin/bash
# Runs the atomic-save real-app specs against the isolated build in <scratch-dir> (see README.md). Serves the
# frontend on :15421 for the run, uses a throw-away HOME, and removes both afterwards.
set -euo pipefail
SCRATCH="${1:?usage: run.sh <scratch-dir> [spec-glob]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export CLUTTER_ATOMIC_TEST_BINARY="$SCRATCH/clutter-atomictest"
export CLUTTER_FAKE_HOME="/private/tmp/clutter-atomictest-home-$$"
[ -n "${2:-}" ] && export CLUTTER_ATOMIC_SPEC="$2"
# The isolated binary's WebKit storage (localStorage, so the Space registry) outlives a run and lives under the real
# home, keyed by the executable name. Wipe exactly that, and nothing else, so each run starts with no Spaces.
for store in "$HOME/Library/WebKit/clutter-atomictest" "$HOME/Library/Caches/clutter-atomictest"; do
  case "$store" in */clutter-atomictest) rm -rf "$store" ;; *) echo "refusing to remove $store" >&2; exit 1 ;; esac
done
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
cd "$HERE/.."
# The crash specs kill the app on purpose, so wdio cannot close that session and exits non-zero even when every
# test passed. The verdict is therefore read from the specs' own results: no failed test, and at least one passed.
LOG="$(mktemp)"
npx wdio run atomic-test/wdio.atomic.conf.ts 2>&1 | tee "$LOG" || true
FAILED=$(grep -c "✖" "$LOG" || true)
PASSED=$(grep -c "✓" "$LOG" || true)
rm -f "$LOG"
echo "atomic-test: $PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ] && [ "$PASSED" -gt 0 ]
