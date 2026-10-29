#!/bin/bash
# Builds and runs the two cells of the native-writer matrix as real builds (ADR-063), in the isolated harness: atomic
# saves are the only saving system, so the cells are "the native writer is compiled in" (saves replace the file whole)
# and "it is not" (the app refuses to open a Space; nothing is written, and there is no fallback to the plugin writer).
# <scratch-dir> receives one directory per cell and the shared cargo targets.
set -euo pipefail
SCRATCH="${1:?usage: run-matrix.sh <scratch-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export CARGO_TARGET_ROOT="$SCRATCH"
STATUS=0
#            native  expect         native commands
for CELL in "true    atomic         present" \
            "false   misconfigured  absent"; do
  set -- $CELL
  DIR="$SCRATCH/cell-native-$1"
  "$HERE/build-isolated-app.sh" "$DIR" "$1" | tail -1
  echo "== cell: native writer=$1 -> expect $2"
  CLUTTER_MATRIX_EXPECT="$2" CLUTTER_MATRIX_NATIVE="$3" "$HERE/run.sh" "$DIR" 'specs/build-matrix.spec.ts' || STATUS=1
done
exit $STATUS
