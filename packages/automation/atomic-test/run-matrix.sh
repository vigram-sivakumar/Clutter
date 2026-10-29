#!/bin/bash
# Builds and runs the four cells of the frontend-flag x Rust-feature matrix as real builds (ADR-063), in the isolated
# harness. <scratch-dir> receives one directory per cell and the shared cargo targets.
set -euo pipefail
SCRATCH="${1:?usage: run-matrix.sh <scratch-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export CARGO_TARGET_ROOT="$SCRATCH"
STATUS=0
#            frontend rust   expect         native
for CELL in "false false old            absent" \
            "true  true  atomic         present" \
            "true  false misconfigured  absent" \
            "false true  old            present"; do
  set -- $CELL
  DIR="$SCRATCH/cell-frontend-$1-rust-$2"
  "$HERE/build-isolated-app.sh" "$DIR" "$1" "$2" | tail -1
  echo "== cell: frontend atomic=$1, rust atomic=$2 -> expect $3"
  CLUTTER_MATRIX_EXPECT="$3" CLUTTER_MATRIX_NATIVE="$4" "$HERE/run.sh" "$DIR" 'specs/build-matrix.spec.ts' || STATUS=1
done
exit $STATUS
