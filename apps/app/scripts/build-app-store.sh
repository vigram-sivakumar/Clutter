#!/bin/bash
# Builds the Mac App Store candidate and verifies it. Saves go through the native atomic writer only, in this build
# and in development alike (ADR-063): the default `atomic-writes` Cargo feature is on, and this script refuses to
# build without it. The App Store build adds the sandbox entitlements (appstore/Entitlements.plist).
#
#   APPLE_SIGNING_IDENTITY   the distribution identity to sign with. Without it the build is signed ad hoc, which is
#                            only for local verification (set ALLOW_ADHOC=1 to acknowledge that).
#   CARGO_TARGET_DIR         where to build (default: the usual target directory)
#   APP_STORE_TEST_HARNESS=1 also compiles the WebDriver plugin and the test-only entitlement, for the real-app suite.
#                            Never for a submission: the verification step rejects it unless told otherwise.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/.."
cd "$APP_DIR"

FEATURES=""
VERIFY_ARGS=()
CONFIGS=(--config src-tauri/appstore/tauri.appstore.conf.json)
if [ "${APP_STORE_TEST_HARNESS:-0}" = "1" ]; then
  FEATURES="automation"
  VERIFY_ARGS=(--allow-test-harness)
fi
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  CONFIGS+=(--config "{\"bundle\":{\"macOS\":{\"signingIdentity\":\"$APPLE_SIGNING_IDENTITY\"}}}")
elif [ "${ALLOW_ADHOC:-0}" = "1" ]; then
  CONFIGS+=(--config '{"bundle":{"macOS":{"signingIdentity":"-"}}}')
else
  echo "No APPLE_SIGNING_IDENTITY. Set it, or set ALLOW_ADHOC=1 for a local, ad-hoc-signed verification build." >&2
  exit 1
fi
if [ -n "${APP_STORE_EXTRA_CONFIG:-}" ]; then CONFIGS+=(--config "$APP_STORE_EXTRA_CONFIG"); fi

../../node_modules/.bin/tauri build "${CONFIGS[@]}" ${FEATURES:+--features "$FEATURES"} --bundles app

TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
BUNDLE=$(ls -d "$TARGET"/release/bundle/macos/*.app | head -1)
echo "built: $BUNDLE"
"$HERE/verify-app-store-bundle.sh" "$BUNDLE" ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"}
