#!/bin/bash
# Stops the sandbox test app, wipes ONLY the test identity's container state and the disposable folders, verifies the
# start is clean, then runs the given spec glob.
set -u
S=$(cat /private/tmp/claude-502/sbx_path)
C=/Users/sivakuv3/Library/Containers/com.clutter.sandboxtest/Data
pkill -f "Clutter Sandbox Test.app/Contents/MacOS/app"; pkill -f safekey.sh
for i in 1 2 3 4 5; do pgrep -f "Clutter Sandbox Test.app/Contents/MacOS/app" >/dev/null || break; sleep 1; done
rm -rf /Users/sivakuv3/Documents/ClutterSbxAccept /Users/Shared/zz-sbx-existing-space /private/tmp/zz-sbx-assets /private/tmp/zz-sbx-outside-space
case "$C" in */com.clutter.sandboxtest/Data) rm -rf "$C"/Documents/* "$C"/Library/Application\ Support/* "$C"/Library/WebKit "$C"/Library/Caches "$C"/Library/Preferences/com.clutter.sandboxtest* "$C"/*.json;; esac
if pgrep -f "Clutter Sandbox Test.app/Contents/MacOS/app" >/dev/null || [ -e /Users/sivakuv3/Documents/ClutterSbxAccept ] || [ -e "$C/Library/Application Support/com.clutter.sandboxtest/space-access.json" ]; then echo "START NOT CLEAN"; exit 1; fi
echo "START CLEAN"
cd /Users/sivakuv3/Documents/Personal/projects/Clutter/packages/automation
CLUTTER_SANDBOX_SPEC="${1:-specs-accept/*.spec.ts}" $S/run-sandbox.sh
