#!/bin/bash
# Verifies a built Clutter .app is a valid Mac App Store candidate. Packaging fails (exit 1) unless every check passes:
#
#   * the App Sandbox entitlements are present and the user-selected and bookmark entitlements are there;
#   * no entitlement the App Store build must not have (temporary exceptions, all-files access, debugging, automation);
#   * the native atomic writer and the sandbox access commands are compiled into the executable. Atomic saves are the
#     only saving system (ADR-063); an executable without them cannot save at all, and the app refuses to open a Space,
#     but a package that can never save is caught here, before it is ever installed;
#   * the WebDriver automation plugin is not in the executable (test harness builds pass --allow-test-harness).
#
# usage: verify-app-store-bundle.sh <path/to/Clutter.app> [--allow-test-harness]
set -uo pipefail
APP="${1:?usage: verify-app-store-bundle.sh <path/to/Clutter.app> [--allow-test-harness]}"
ALLOW_HARNESS=false
[ "${2:-}" = "--allow-test-harness" ] && ALLOW_HARNESS=true
FAILED=0
fail() { echo "FAIL: $1"; FAILED=1; }
pass() { echo "ok:   $1"; }

[ -d "$APP/Contents/MacOS" ] || { echo "FAIL: $APP is not an app bundle"; exit 1; }
EXECUTABLE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$APP/Contents/Info.plist" 2>/dev/null)
BINARY="$APP/Contents/MacOS/$EXECUTABLE"
[ -f "$BINARY" ] || { echo "FAIL: executable $BINARY not found"; exit 1; }

ENTITLEMENTS=$(codesign -d --entitlements - --xml "$APP" 2>/dev/null | tr -d '\n')
has_true() { echo "$ENTITLEMENTS" | grep -q "<key>$1</key><true/>"; }

for REQUIRED in com.apple.security.app-sandbox com.apple.security.files.user-selected.read-write com.apple.security.files.bookmarks.app-scope com.apple.security.network.client; do
  has_true "$REQUIRED" && pass "entitlement $REQUIRED" || fail "missing entitlement $REQUIRED"
done
for FORBIDDEN in 'temporary-exception' 'files.all' 'get-task-allow' 'disable-library-validation' 'allow-dyld-environment' 'automation.apple-events' 'cs.debugger'; do
  echo "$ENTITLEMENTS" | grep -q "$FORBIDDEN" && fail "forbidden entitlement matching '$FORBIDDEN'" || pass "no entitlement matching '$FORBIDDEN'"
done
if echo "$ENTITLEMENTS" | grep -q "network.server"; then
  $ALLOW_HARNESS && pass "network.server allowed for the test harness" || fail "network.server is not allowed in the App Store build"
else
  pass "no network.server entitlement"
fi

for SYMBOL in atomic_write_file atomic_inspect_write atomic_confirm_durability restore_space_access request_documents_access; do
  grep -aq "$SYMBOL" "$BINARY" && pass "executable contains $SYMBOL" || fail "executable lacks $SYMBOL (built without the default atomic-writes feature?)"
done

if grep -aq "tauri-plugin-wdio-webdriver\|wdio-webdriver" "$BINARY"; then
  $ALLOW_HARNESS && pass "test harness plugin present (allowed)" || fail "the WebDriver automation plugin is compiled in"
else
  pass "no automation plugin"
fi

IDENTIFIER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist" 2>/dev/null)
[ "$IDENTIFIER" = "com.clutter.dev" ] && echo "warn: bundle identifier is still the development one (com.clutter.dev)"

codesign --verify --deep --strict "$APP" 2>/dev/null && pass "code signature is valid" || fail "code signature does not verify"
SIGNATURE=$(codesign -dv "$APP" 2>&1)
echo "$SIGNATURE" | grep -q "Signature=adhoc" && echo "warn: ad-hoc signature; a Mac App Store submission needs an Apple distribution signature"

[ "$FAILED" -eq 0 ] && { echo "RESULT: pass"; exit 0; }
echo "RESULT: FAIL"
exit 1
