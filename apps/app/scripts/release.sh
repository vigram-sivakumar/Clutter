#!/bin/bash
# Local builds and direct-download beta releases use the validated Sparkle path.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

case "${1:-production}" in
  local)
    bash "$HERE/build-beta.sh"
    if [ "${2:-}" = "--publish" ]; then npm run publish:update; fi
    ;;
  beta)
    WRANGLER="$HERE/../../../workers/updates/node_modules/.bin/wrangler"
    CONFIG="$HERE/../../../workers/updates/wrangler.toml"
    [ -x "$WRANGLER" ] && [ -f "$CONFIG" ] || {
      echo 'Install dependencies in workers/updates before releasing.' >&2; exit 1;
    }
    "$WRANGLER" whoami >/dev/null
    bash "$HERE/build-beta.sh"
    npm run publish:update
    echo "Apple Silicon Sparkle beta built, verified and published."
    ;;
  production)
    echo 'Use npm run release:direct -- X.Y.Z or npm run release:appstore -- X.Y.Z.' >&2
    exit 1
    ;;
  *)
    echo 'Usage: release.sh local [--publish]|beta|production' >&2
    exit 2
    ;;
esac
