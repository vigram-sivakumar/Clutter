#!/bin/bash
# Single release entry point; version is explicit, never silently incremented.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
MODE="${1:-}"
VERSION="${2:-}"
OPTION="${3:-}"
[ "$#" -le 3 ] || { echo "Too many release arguments" >&2; exit 2; }
[[ "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Usage: npm run release:direct -- X.Y.Z or npm run release:appstore -- X.Y.Z' >&2; exit 2; }
case "$MODE" in
  direct)
    [ -z "$OPTION" ] || [ "$OPTION" = "--prepare" ] || { echo 'Direct release accepts only --prepare as an optional argument' >&2; exit 2; }
    WRANGLER="$HERE/../../../workers/updates/node_modules/.bin/wrangler"
    [ -x "$WRANGLER" ] || { echo 'Install dependencies in workers/updates first' >&2; exit 1; }
    "$WRANGLER" whoami >/dev/null
    ;;
  appstore)
    if [ -n "$OPTION" ]; then export APP_STORE_BUILD_NUMBER="$OPTION"; fi
    for NAME in APPLE_SIGNING_IDENTITY APPLE_INSTALLER_IDENTITY APPLE_PROVISIONING_PROFILE APP_STORE_API_KEY APP_STORE_API_ISSUER APP_STORE_BUILD_NUMBER; do
      [ -n "${!NAME:-}" ] || { echo "App Store release requires $NAME" >&2; exit 1; }
    done
    [ "${APP_STORE_DRY_RUN:-0}" != 1 ] || { echo 'Do not use APP_STORE_DRY_RUN with a release command' >&2; exit 1; }
    ;;
  *) echo 'Unknown distribution method' >&2; exit 2 ;;
esac
LOCK="$PWD/src-tauri/target/.clutter-release-lock"
mkdir -p "$(dirname "$LOCK")"
mkdir "$LOCK" 2>/dev/null || { echo "A release may already be running. Inspect $LOCK before removing a stale lock." >&2; exit 1; }
trap 'rmdir "$LOCK"' EXIT
CURRENT=$(node -p "require('./package.json').version")
python3 - "$CURRENT" "$VERSION" <<'PY'
import sys
old, new = (tuple(map(int, v.split('.'))) for v in sys.argv[1:])
if new < old or new[1] >= 1000 or new[2] >= 1000:
    raise SystemExit('Release version must not go backwards; minor and patch must be below 1000')
PY
if [ "$CURRENT" != "$VERSION" ]; then
  npm version "$VERSION" --no-git-tag-version
fi
# Always reconcile the native manifest, even if a previous command stopped mid-bump.
python3 - "$VERSION" <<'PY'
import pathlib, re, sys
path = pathlib.Path('src-tauri/Cargo.toml')
source = path.read_text()
new, count = re.subn(r'(?m)^version = "[0-9]+\.[0-9]+\.[0-9]+"$', 'version = "' + sys.argv[1] + '"', source, count=1)
if count != 1: raise SystemExit('Could not find application package version')
if new != source: path.write_text(new)
PY
cargo check --manifest-path src-tauri/Cargo.toml
npm run check:version
case "$MODE" in
  direct)
    # Resume an interrupted publish without rebuilding its versioned bytes.
    if [ ! -d "$PWD/src-tauri/target/sparkle/releases/$VERSION" ]; then
      bash "$HERE/build-sparkle-integration.sh" direct
    fi
    if [ "$OPTION" = "--prepare" ]; then
      echo "Prepared $VERSION. Nothing published; repeat without --prepare to publish these exact bytes."
    else
      bash "$HERE/publish-update.sh"
    fi
    ;;
  appstore)
    APP_STORE_UPLOAD=1 bash "$HERE/build-app-store.sh"
    ;;
esac
