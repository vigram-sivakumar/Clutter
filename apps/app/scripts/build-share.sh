#!/bin/bash
# Builds an installer to GIVE TO TESTERS or friends: signed with a Developer ID Application identity, hardened runtime,
# notarized by Apple and stapled, so Gatekeeper opens it on other Macs. Same Clutter, same sandbox, same atomic writer as
# `npm run tauri build`; only the signing differs.
#
# Needs (nothing here can be faked, and without them this script stops before building):
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: Your Name (TEAMID)", a certificate in your keychain
#   and one set of notarization credentials:
#     APPLE_ID + APPLE_PASSWORD (an app-specific password) + APPLE_TEAM_ID
#     or APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH (an App Store Connect API key)
# Optional: CARGO_TARGET_DIR (where to build).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

MISSING=()
[ -n "${APPLE_SIGNING_IDENTITY:-}" ] || MISSING+=("APPLE_SIGNING_IDENTITY (a Developer ID Application certificate)")
if [ -z "${APPLE_ID:-}${APPLE_API_KEY:-}" ]; then
  MISSING+=("notarization credentials: APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID, or APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH")
elif [ -n "${APPLE_ID:-}" ] && { [ -z "${APPLE_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; }; then
  MISSING+=("APPLE_PASSWORD and APPLE_TEAM_ID (needed with APPLE_ID)")
elif [ -n "${APPLE_API_KEY:-}" ] && { [ -z "${APPLE_API_ISSUER:-}" ] || [ -z "${APPLE_API_KEY_PATH:-}" ]; }; then
  MISSING+=("APPLE_API_ISSUER and APPLE_API_KEY_PATH (needed with APPLE_API_KEY)")
fi
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "Cannot build a shareable installer. Missing:" >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  echo "For an installer that only runs on THIS Mac, use: npm run tauri build" >&2
  exit 1
fi
case "$APPLE_SIGNING_IDENTITY" in
  "Developer ID Application"*) ;;
  *) echo "APPLE_SIGNING_IDENTITY must be a Developer ID Application identity (got: $APPLE_SIGNING_IDENTITY)" >&2; exit 1 ;;
esac
security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY" \
  || { echo "The identity '$APPLE_SIGNING_IDENTITY' is not in your keychain." >&2; exit 1; }

"$HERE/check-atomic-default.sh"
../../node_modules/.bin/tauri build
TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
BUNDLE=$(ls -d "$TARGET"/release/bundle/macos/*.app | head -1)
echo "built: $BUNDLE"
"$HERE/verify-bundle.sh" "$BUNDLE" --share
ls "$TARGET"/release/bundle/dmg/*.dmg 2>/dev/null | sed 's/^/installer: /'
