#!/bin/bash
# Prepares Clutter for Mac App Store submission: the same app as `npm run tauri build` (same code, same sandbox, same
# atomic writer), packaged with Apple's distribution signing, an embedded provisioning profile and a signed installer
# package. Only the distribution configuration differs.
#
# Needs Apple credentials; without them this script stops before building and says exactly what is missing:
#   APPLE_SIGNING_IDENTITY   "3rd Party Mac Developer Application: Name (TEAMID)" or "Apple Distribution: ..."
#   APPLE_INSTALLER_IDENTITY "3rd Party Mac Developer Installer: Name (TEAMID)" or "Mac Installer Distribution: ..."
#   APPLE_PROVISIONING_PROFILE  path to the Mac App Store provisioning profile (.provisionprofile) for the bundle id
#   (The bundle identifier is not an input: it is the "identifier" in src-tauri/tauri.conf.json, com.vigram.clutter, and
#   the provisioning profile must be for exactly that. APP_STORE_BUNDLE_ID may be set, but must equal it.)
# Optional: APP_STORE_BUILD_NUMBER (CFBundleVersion for this upload, for example 2; it must be higher than every build
# already uploaded for this version, and defaults to the "bundleVersion" in tauri.conf.json, currently 1; the marketing
# version stays in apps/app/package.json), CARGO_TARGET_DIR, APP_STORE_DRY_RUN=1 (checks the credentials and prints the configuration it would use,
# builds nothing).
#
# NOT verified end to end: this machine has no App Store credentials, so the signing, embedding and packaging steps
# below have never run against Apple's tools. See docs/building-and-distribution.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

MISSING=()
for NAME in APPLE_SIGNING_IDENTITY APPLE_INSTALLER_IDENTITY APPLE_PROVISIONING_PROFILE; do
  [ -n "${!NAME:-}" ] || MISSING+=("$NAME")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "Cannot prepare a Mac App Store submission. Missing: ${MISSING[*]}" >&2
  echo "See the header of this script and docs/building-and-distribution.md." >&2
  exit 1
fi
# One source for the identifier: the config. It is never the retired development one.
CONFIG_BUNDLE_ID=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['identifier'])")
[ "$CONFIG_BUNDLE_ID" = "com.vigram.clutter" ] || { echo "src-tauri/tauri.conf.json identifier is '$CONFIG_BUNDLE_ID', not com.vigram.clutter." >&2; exit 1; }
APP_STORE_BUNDLE_ID="${APP_STORE_BUNDLE_ID:-$CONFIG_BUNDLE_ID}"
[ "$APP_STORE_BUNDLE_ID" = "$CONFIG_BUNDLE_ID" ] || { echo "APP_STORE_BUNDLE_ID '$APP_STORE_BUNDLE_ID' differs from the configured identifier '$CONFIG_BUNDLE_ID'." >&2; exit 1; }
CONFIG_BUILD_NUMBER=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['bundle']['macOS']['bundleVersion'])")
BUILD_NUMBER="${APP_STORE_BUILD_NUMBER:-$CONFIG_BUILD_NUMBER}"
echo "$BUILD_NUMBER" | grep -qE '^[0-9]+(\.[0-9]+){0,2}$' || { echo "The build number '$BUILD_NUMBER' must be one to three dot-separated integers (for example 2)." >&2; exit 1; }
[ -f "$APPLE_PROVISIONING_PROFILE" ] || { echo "Provisioning profile not found: $APPLE_PROVISIONING_PROFILE" >&2; exit 1; }
case "$APPLE_SIGNING_IDENTITY" in
  "3rd Party Mac Developer Application"*|"Apple Distribution"*) ;;
  *) echo "APPLE_SIGNING_IDENTITY must be a Mac App Store distribution identity (3rd Party Mac Developer Application / Apple Distribution)." >&2; exit 1 ;;
esac
case "$APPLE_INSTALLER_IDENTITY" in
  "3rd Party Mac Developer Installer"*|"Mac Installer Distribution"*) ;;
  *) echo "APPLE_INSTALLER_IDENTITY must be a Mac App Store installer identity (3rd Party Mac Developer Installer / Mac Installer Distribution)." >&2; exit 1 ;;
esac
security find-identity -v | grep -qF "$APPLE_SIGNING_IDENTITY" || { echo "'$APPLE_SIGNING_IDENTITY' is not in your keychain." >&2; exit 1; }
security find-identity -v | grep -qF "$APPLE_INSTALLER_IDENTITY" || { echo "'$APPLE_INSTALLER_IDENTITY' is not in your keychain." >&2; exit 1; }

# The profile names the team and the application identifier the entitlements must carry.
PROFILE_PLIST=$(mktemp)
security cms -D -i "$APPLE_PROVISIONING_PROFILE" > "$PROFILE_PLIST"
APPLICATION_IDENTIFIER=$(/usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.application-identifier" "$PROFILE_PLIST")
TEAM_ID=$(/usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.developer.team-identifier" "$PROFILE_PLIST")
[ "$APPLICATION_IDENTIFIER" = "$TEAM_ID.$APP_STORE_BUNDLE_ID" ] || [ "$APPLICATION_IDENTIFIER" = "$TEAM_ID.*" ] \
  || { echo "The provisioning profile is for $APPLICATION_IDENTIFIER, not $TEAM_ID.$APP_STORE_BUNDLE_ID." >&2; exit 1; }

# The same entitlements as every packaged build, plus the two identifiers Apple requires.
WORK=$(mktemp -d)
ENTITLEMENTS="$WORK/Entitlements.plist"
cp src-tauri/Entitlements.plist "$ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :com.apple.application-identifier string $TEAM_ID.$APP_STORE_BUNDLE_ID" "$ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string $TEAM_ID" "$ENTITLEMENTS"
CONFIG=$(python3 - "$APP_STORE_BUNDLE_ID" "$ENTITLEMENTS" "$APPLE_SIGNING_IDENTITY" "$APPLE_PROVISIONING_PROFILE" "$BUILD_NUMBER" <<'PY'
import json, sys
bundle_id, entitlements, identity, profile, build_number = sys.argv[1:6]
print(json.dumps({
    "identifier": bundle_id,
    "bundle": {"macOS": {"bundleVersion": build_number, "entitlements": entitlements, "signingIdentity": identity,
                         "files": {"embedded.provisionprofile": profile}}},
}))
PY
)
if [ "${APP_STORE_DRY_RUN:-0}" = "1" ]; then
  echo "dry run: credentials look consistent. Configuration that would be merged over tauri.conf.json:"
  echo "$CONFIG"
  exit 0
fi

"$HERE/check-atomic-default.sh"
"$HERE/check-legal-links.sh"
python3 -I "$HERE/check-privacy-manifest.py" src-tauri/PrivacyInfo.xcprivacy
../../node_modules/.bin/tauri build --config "$CONFIG" --bundles app
TARGET="${CARGO_TARGET_DIR:-src-tauri/target}"
BUNDLE=$(ls -d "$TARGET"/release/bundle/macos/*.app | head -1)
"$HERE/verify-bundle.sh" "$BUNDLE" --submission
PKG="$TARGET/release/bundle/Clutter-AppStore.pkg"
xcrun productbuild --component "$BUNDLE" /Applications --sign "$APPLE_INSTALLER_IDENTITY" "$PKG"
pkgutil --check-signature "$PKG"
echo "ready to upload (Transporter or xcrun altool): $PKG"
