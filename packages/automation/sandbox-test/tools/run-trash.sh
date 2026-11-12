#!/bin/bash
# Runs the macOS Trash sandbox specs (specs-trash/) against a sandbox test bundle, one spec file per app launch, in
# order. Nothing is wiped: the test identity's container (and its saved Documents access) is reused.
#
#   CLUTTER_SANDBOX_BINARY  path to ".../Clutter Sandbox Test.app/Contents/MacOS/app" (required)
#   CLUTTER_TRASH_SPECS     which kinds to run: "docs existing outside" (default: docs). existing/outside need the
#                           system file panel (attended: safekey.sh presses Return while the panel is up).
#   CLUTTER_KEEP_TRASH=1    leave the trashed items in the Trash so Finder visibility and Put Back can be checked by hand
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../.."
: "${CLUTTER_SANDBOX_BINARY:?set CLUTTER_SANDBOX_BINARY to the sandbox test bundle binary}"
export CLUTTER_SANDBOX_BINARY
export CLUTTER_FAKE_HOME="${CLUTTER_FAKE_HOME:-$HOME/Library/Containers/${CLUTTER_SBX_ID:-com.clutter.sandboxtest}/Data}"
KINDS="${CLUTTER_TRASH_SPECS:-docs}"
status=0
run() {
  pkill -f "safeke[y].sh" 2>/dev/null
  echo "== $1"
  CLUTTER_SANDBOX_SPEC="specs-trash/$1" npx wdio run sandbox-test/wdio.sandbox.conf.ts 2>&1 | grep -E "✓|✖|Spec Files|Expected|Received|TRASH-LOCATION|Error" | cut -c1-260
  [ "${PIPESTATUS[0]}" -eq 0 ] || status=1
}
for kind in $KINDS; do
  case "$kind" in docs) n=1;; existing) n=3;; outside) n=5;; *) echo "unknown kind $kind"; exit 2;; esac
  run "trash-$n-$kind-setup.spec.ts"
  run "trash-$((n+1))-$kind-delete.spec.ts"
done
run "trash-7-cleanup.spec.ts"
echo "TRASH-RUN-DONE status=$status"
exit $status
