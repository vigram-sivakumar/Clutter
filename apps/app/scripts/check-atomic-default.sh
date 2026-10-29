#!/bin/bash
# Fails unless atomic saves are enabled correctly in BOTH halves of the app (ADR-063): the Rust half (the native writer
# is a default Cargo feature) and the interface half (the flag is on, with no environment switch to turn it off).
# Run before any build that is going to be distributed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/.."
cd "$APP_DIR"

grep -qE '^default = \[[^]]*"atomic-writes"' src-tauri/Cargo.toml \
  || { echo "FAIL: the atomic-writes Cargo feature is not a default feature (src-tauri/Cargo.toml)" >&2; exit 1; }
grep -qE '^\s*atomicWrites: true,' src/core/featureFlags.ts \
  || { echo "FAIL: featureFlags.atomicWrites is not true (src/core/featureFlags.ts)" >&2; exit 1; }
if grep -q 'VITE_ATOMIC_WRITES' src/core/featureFlags.ts; then
  echo "FAIL: an environment variable can switch atomic saves off (src/core/featureFlags.ts)" >&2; exit 1
fi
../../node_modules/.bin/vitest run src/core/vault/atomicWrite/AtomicWriteContract.test.ts src/core/vault/atomicWrite/AtomicWriteFileSystem.test.ts >/dev/null \
  || { echo "FAIL: the atomic-writer contract tests do not pass" >&2; exit 1; }
echo "ok: atomic saves are on in the Rust and interface halves, with no switch and no fallback"
