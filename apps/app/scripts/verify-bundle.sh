#!/bin/bash
# Verifies a built Clutter .app. Packaging fails (exit 1) unless every check for the chosen mode passes.
#
# Every mode (one Clutter: the same checks for every distribution):
#   * the App Sandbox entitlements are present, with user-selected folders and bookmarks;
#   * none of the entitlements a shipped build must not have (temporary exceptions, all-files access, debugging, ...);
#   * the native atomic writer and the sandbox-access commands are compiled into the executable. Atomic saves are the
#     only saving system (ADR-063): an executable without them cannot save at all, so a package without them is
#     rejected here, before it is installed;
#   * the WebDriver automation plugin is not in the executable (a test-harness build says so explicitly);
#   * the app icon is the native Icon Composer asset (Contents/Resources/Assets.car, CFBundleIconName, with the default,
#     dark and tinted renditions) and a valid legacy .icns is present as the fallback for macOS before 26. Tauri
#     skips the Assets.car without failing when Xcode 26+ (actool) is missing, so this check is what catches that;
#   * the code signature verifies.
#
# --local (default)  an installable build for this Mac: an ad-hoc signature is fine.
# --beta             an Apple Silicon beta build: production bundle identifier, arm64-only executable and a valid
#                    ad-hoc signature. Gatekeeper may block downloads on other Macs; no notarization is implied.
# --share            a build to give to testers: must carry a Developer ID signature with the hardened runtime, and be
#                    notarized with the ticket stapled, or Gatekeeper blocks it on other Macs.
# --submission       a Mac App Store candidate: a distribution signature, the embedded provisioning profile, and the
#                    application and team identifiers Apple requires, with the production bundle identifier
#                    (com.vigram.clutter) and a valid build number.
#
# usage: verify-bundle.sh <path/to/Clutter.app> [--local|--beta|--share|--submission] [--allow-test-harness]
set -uo pipefail
APP="${1:?usage: verify-bundle.sh <path/to/Clutter.app> [--local|--share|--submission] [--allow-test-harness]}"
shift
MODE=local
ALLOW_HARNESS=false
for ARG in "$@"; do
  case "$ARG" in
    --local) MODE=local ;;
    --beta) MODE=beta ;;
    --share) MODE=share ;;
    --submission) MODE=submission ;;
    --allow-test-harness) ALLOW_HARNESS=true ;;
    *) echo "unknown option $ARG" >&2; exit 2 ;;
  esac
done
FAILED=0
fail() { echo "FAIL: $1"; FAILED=1; }
pass() { echo "ok:   $1"; }
warn() { echo "warn: $1"; }

[ -d "$APP/Contents/MacOS" ] || { echo "FAIL: $APP is not an app bundle"; exit 1; }
EXECUTABLE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$APP/Contents/Info.plist" 2>/dev/null)
BINARY="$APP/Contents/MacOS/$EXECUTABLE"
[ -f "$BINARY" ] || { echo "FAIL: executable $BINARY not found"; exit 1; }
echo "verifying $APP as: $MODE"

ENTITLEMENTS=$(codesign -d --entitlements - --xml "$APP" 2>/dev/null | tr -d '\n')
has_true() { echo "$ENTITLEMENTS" | grep -q "<key>$1</key><true/>"; }

for REQUIRED in com.apple.security.app-sandbox com.apple.security.files.user-selected.read-write com.apple.security.files.bookmarks.app-scope com.apple.security.network.client; do
  has_true "$REQUIRED" && pass "entitlement $REQUIRED" || fail "missing entitlement $REQUIRED"
done
for FORBIDDEN in 'temporary-exception' 'files.all' 'get-task-allow' 'disable-library-validation' 'allow-dyld-environment' 'automation.apple-events' 'cs.debugger'; do
  echo "$ENTITLEMENTS" | grep -q "$FORBIDDEN" && fail "forbidden entitlement matching '$FORBIDDEN'" || pass "no entitlement matching '$FORBIDDEN'"
done
if echo "$ENTITLEMENTS" | grep -q "network.server"; then
  $ALLOW_HARNESS && pass "network.server allowed for the test harness" || fail "network.server is not allowed"
else
  pass "no network.server entitlement"
fi

for SYMBOL in atomic_write_file atomic_inspect_write atomic_confirm_durability restore_space_access request_documents_access; do
  grep -aq "$SYMBOL" "$BINARY" && pass "executable contains $SYMBOL" || fail "executable lacks $SYMBOL (built without the default atomic-writes feature?)"
done

if grep -aq "wdio-webdriver" "$BINARY"; then
  $ALLOW_HARNESS && pass "test harness plugin present (allowed)" || fail "the WebDriver automation plugin is compiled in"
else
  pass "no automation plugin"
fi

# The app icon: the compiled Icon Composer asset, plus the legacy .icns for systems that do not read it. The icon is built
# from src-tauri/icons/Clutter.icon (bundle.icon in tauri.conf.json); an Assets.car missing here means the build ran
# without Xcode 26 or later (Tauri logs an error and carries on), so a packaged build must not go out.
ICON_NAME=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null)
ASSETS_CAR="$APP/Contents/Resources/Assets.car"
if [ -f "$ASSETS_CAR" ]; then
  pass "Contents/Resources/Assets.car exists"
  [ "$ICON_NAME" = "Icon" ] && pass "CFBundleIconName is Icon" || fail "CFBundleIconName is '$ICON_NAME', expected Icon (the name Tauri gives the compiled Icon Composer asset)"
  CAR_INFO=$(xcrun assetutil --info "$ASSETS_CAR" 2>/dev/null)
  for APPEARANCE in NSAppearanceNameAqua NSAppearanceNameDarkAqua ISAppearanceTintable; do
    # Python rather than a text match: the icon stack for each appearance must be an IconImageStack named after the icon.
    echo "$CAR_INFO" | python3 -I -c "
import json, sys
entries = json.load(sys.stdin)
sys.exit(0 if any(e.get('AssetType') == 'IconImageStack' and e.get('Name') == '$ICON_NAME' and e.get('Appearance') == '$APPEARANCE' for e in entries) else 1)
" 2>/dev/null && pass "icon rendition $APPEARANCE in Assets.car" || fail "Assets.car has no $APPEARANCE icon rendition"
  done
else
  fail "no Contents/Resources/Assets.car: the Icon Composer icon was not compiled (needs Xcode 26 or later; see docs/building-and-distribution.md)"
fi
ICNS_NAME=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$APP/Contents/Info.plist" 2>/dev/null)
ICNS="$APP/Contents/Resources/$ICNS_NAME"
if [ -n "$ICNS_NAME" ] && [ -f "$ICNS" ] && python3 -I - "$ICNS" <<'PY'
import struct, sys
data = open(sys.argv[1], "rb").read()
if data[:4] != b"icns" or struct.unpack(">I", data[4:8])[0] != len(data):
    sys.exit(1)
types, pos = set(), 8
while pos + 8 <= len(data):
    kind, length = struct.unpack(">4sI", data[pos:pos + 8])
    if length < 8:
        sys.exit(1)
    types.add(kind.decode("latin-1"))
    pos += length
# 512x512 (ic09) and 512x512@2x (ic10): what the Mac App Store has always required of an .icns.
sys.exit(0 if pos == len(data) and {"ic09", "ic10"} <= types else 1)
PY
then pass "legacy icon $ICNS_NAME is a valid .icns with 512x512 and 512x512@2x"; else fail "no valid legacy .icns (CFBundleIconFile '$ICNS_NAME'): needs a well-formed file with 512x512 and 512x512@2x"; fi

codesign --verify --deep --strict "$APP" 2>/dev/null && pass "code signature is valid" || fail "code signature does not verify"
PRIVACY="$APP/Contents/Resources/PrivacyInfo.xcprivacy"
if [ -f "$PRIVACY" ]; then
  plutil -lint "$PRIVACY" >/dev/null 2>&1 && pass "privacy manifest is a valid property list" || fail "PrivacyInfo.xcprivacy is not a valid property list"
  # Structure (Apple's keys, data types, purposes, categories and reason codes), and that the required-reason APIs the
  # executable imports are exactly the categories declared: an undeclared one is refused by App Store Connect.
  if CHECK=$(python3 -I "$(dirname "$0")/check-privacy-manifest.py" "$PRIVACY" "$BINARY" 2>&1); then
    pass "privacy manifest is valid and matches the executable's required-reason APIs"
  else
    echo "$CHECK" | sed 's/^/      /'
    fail "privacy manifest is invalid or does not match the executable"
  fi
else
  fail "no Contents/Resources/PrivacyInfo.xcprivacy (App Store validation requires a privacy manifest)"
fi

SIGNATURE=$(codesign -dvv "$APP" 2>&1)
IDENTIFIER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist" 2>/dev/null)
ADHOC=false
echo "$SIGNATURE" | grep -q "Signature=adhoc" && ADHOC=true

case "$MODE" in
  local)
    $ADHOC && warn "ad-hoc signature: fine to install here, but Gatekeeper blocks it on other Macs (use --share builds for testers)"
    [ "$IDENTIFIER" = "com.vigram.clutter" ] || warn "bundle identifier is $IDENTIFIER, not the production one (com.vigram.clutter)"
    ;;
  beta)
    [ "$IDENTIFIER" = "com.vigram.clutter" ] && pass "bundle identifier $IDENTIFIER" || fail "bundle identifier is $IDENTIFIER, not com.vigram.clutter"
    $ADHOC && warn "ad-hoc signature: macOS may block this downloaded beta; testers may need to approve it in Privacy & Security" || fail "beta build must use an ad-hoc signature (Apple signing is out of scope)"
    ARCHS=$(lipo -archs "$BINARY" 2>/dev/null)
    [ "$ARCHS" = "arm64" ] && pass "architecture arm64 (Apple Silicon)" || fail "architectures '$ARCHS', expected arm64 only"
    ;;
  share)
    [ "$IDENTIFIER" = "com.vigram.clutter" ] && pass "bundle identifier $IDENTIFIER" || fail "bundle identifier is $IDENTIFIER, not com.vigram.clutter"
    $ADHOC && fail "ad-hoc signature: testers' Macs would block this build; sign with a Developer ID Application identity"
    echo "$SIGNATURE" | grep -q "Authority=Developer ID Application" && pass "Developer ID Application signature" || fail "not signed with a Developer ID Application identity"
    echo "$SIGNATURE" | grep -q "flags=.*runtime" && pass "hardened runtime" || fail "hardened runtime is not enabled (required for notarization)"
    xcrun stapler validate "$APP" >/dev/null 2>&1 && pass "notarization ticket is stapled" || fail "no stapled notarization ticket"
    spctl --assess --type execute "$APP" >/dev/null 2>&1 && pass "Gatekeeper accepts the app" || fail "Gatekeeper rejects the app"
    ;;
  submission)
    $ADHOC && fail "ad-hoc signature cannot be submitted"
    echo "$SIGNATURE" | grep -qE "Authority=(3rd Party Mac Developer Application|Apple Distribution)" && pass "distribution signature" || fail "not signed with a Mac App Store distribution identity"
    has_true com.apple.security.app-sandbox || true
    echo "$ENTITLEMENTS" | grep -q "com.apple.application-identifier" && pass "application identifier entitlement" || fail "missing com.apple.application-identifier"
    echo "$ENTITLEMENTS" | grep -q "com.apple.developer.team-identifier" && pass "team identifier entitlement" || fail "missing com.apple.developer.team-identifier"
    [ -f "$APP/Contents/embedded.provisionprofile" ] && pass "provisioning profile embedded" || fail "no embedded.provisionprofile"
    [ "$IDENTIFIER" = "com.vigram.clutter" ] && pass "bundle identifier $IDENTIFIER" || fail "bundle identifier is $IDENTIFIER, not the production com.vigram.clutter"
    SHORT_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null)
    BUILD_NUMBER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$APP/Contents/Info.plist" 2>/dev/null)
    echo "$SHORT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' && pass "marketing version $SHORT_VERSION" || fail "CFBundleShortVersionString '$SHORT_VERSION' is not MAJOR.MINOR.PATCH"
    echo "$BUILD_NUMBER" | grep -qE '^[0-9]+(\.[0-9]+){0,2}$' && [ "$BUILD_NUMBER" != "$SHORT_VERSION" ] && pass "build number $BUILD_NUMBER" || fail "CFBundleVersion '$BUILD_NUMBER' is not a build number of its own (integers, not the marketing version)"
    MINIMUM_SYSTEM=$(/usr/libexec/PlistBuddy -c "Print :LSMinimumSystemVersion" "$APP/Contents/Info.plist" 2>/dev/null)
    [ -n "$MINIMUM_SYSTEM" ] && [ "$(printf '%s\n%s\n' 13.3 "$MINIMUM_SYSTEM" | sort -V | head -1)" = "13.3" ] && pass "minimum macOS $MINIMUM_SYSTEM (13.3 or later)" || fail "LSMinimumSystemVersion '$MINIMUM_SYSTEM' is below 13.3 (the web code needs WebKit 16.4)"
    ARCHS=$(lipo -archs "$BINARY" 2>/dev/null)
    [ "$ARCHS" = "arm64" ] && pass "architecture arm64 (Apple silicon only, as decided for 1.0)" || fail "architectures '$ARCHS', expected arm64 only"
    /usr/libexec/PlistBuddy -c "Print :LSApplicationCategoryType" "$APP/Contents/Info.plist" >/dev/null 2>&1 && pass "App Store category set" || fail "no LSApplicationCategoryType"
    ;;
esac

[ "$FAILED" -eq 0 ] && { echo "RESULT: pass ($MODE)"; exit 0; }
echo "RESULT: FAIL ($MODE)"
exit 1
