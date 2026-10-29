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
#   * the code signature verifies.
#
# --local (default)  an installable build for this Mac: an ad-hoc signature is fine.
# --share            a build to give to testers: must carry a Developer ID signature with the hardened runtime, and be
#                    notarized with the ticket stapled, or Gatekeeper blocks it on other Macs.
# --submission       a Mac App Store candidate: a distribution signature, the embedded provisioning profile, and the
#                    application and team identifiers Apple requires, with a real bundle identifier.
#
# usage: verify-bundle.sh <path/to/Clutter.app> [--local|--share|--submission] [--allow-test-harness]
set -uo pipefail
APP="${1:?usage: verify-bundle.sh <path/to/Clutter.app> [--local|--share|--submission] [--allow-test-harness]}"
shift
MODE=local
ALLOW_HARNESS=false
for ARG in "$@"; do
  case "$ARG" in
    --local) MODE=local ;;
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

codesign --verify --deep --strict "$APP" 2>/dev/null && pass "code signature is valid" || fail "code signature does not verify"
SIGNATURE=$(codesign -dvv "$APP" 2>&1)
IDENTIFIER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist" 2>/dev/null)
ADHOC=false
echo "$SIGNATURE" | grep -q "Signature=adhoc" && ADHOC=true

case "$MODE" in
  local)
    $ADHOC && warn "ad-hoc signature: fine to install here, but Gatekeeper blocks it on other Macs (use --share builds for testers)"
    [ "$IDENTIFIER" = "com.clutter.dev" ] && warn "bundle identifier is the development one ($IDENTIFIER)"
    ;;
  share)
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
    [ "$IDENTIFIER" = "com.clutter.dev" ] && fail "bundle identifier is still the development one" || pass "bundle identifier $IDENTIFIER"
    /usr/libexec/PlistBuddy -c "Print :LSApplicationCategoryType" "$APP/Contents/Info.plist" >/dev/null 2>&1 && pass "App Store category set" || fail "no LSApplicationCategoryType"
    ;;
esac

[ "$FAILED" -eq 0 ] && { echo "RESULT: pass ($MODE)"; exit 0; }
echo "RESULT: FAIL ($MODE)"
exit 1
