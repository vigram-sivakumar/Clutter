#!/bin/bash
# Package the final signed app without rebuilding or modifying its contents.
# Finder presentation is build-time only; no runtime Automation entitlement.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$1"
OUTPUT="$2"
[ "$(uname -s)" = Darwin ] || { echo "macOS required" >&2; exit 1; }
[ -d "$APP/Contents" ] && [ ! -e "$OUTPUT" ] || { echo "Invalid app or output already exists" >&2; exit 1; }
# Keep the source, writable image and mount point separate.
WORK=$(mktemp -d "$(dirname "$OUTPUT")/dmg-layout.XXXXXX")
MOUNT="$WORK/mount"
ATTACHED=0
cleanup() {
  if [ "$ATTACHED" = 1 ]; then
    if ! hdiutil detach "$MOUNT"; then
      echo "Could not detach temporary installer at $MOUNT; eject it before removing $WORK" >&2
      return 1
    fi
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/source/.background" "$MOUNT"
ditto "$APP" "$WORK/source/Clutter.app"
ln -s /Applications "$WORK/source/Applications"
xcrun swift "$HERE/dmg-background.swift" "$WORK/source/.background/installer.png"
hdiutil create -volname Clutter -srcfolder "$WORK/source" -fs HFS+ -format UDRW "$WORK/layout.dmg"
hdiutil attach "$WORK/layout.dmg" -nobrowse -noautoopen -mountpoint "$MOUNT"
ATTACHED=1

# Finder persists the installation presentation in the image's .DS_Store.
# Refuse ambiguous volume names rather than changing a different mounted disk.
# This requires an interactive macOS release session and Finder automation access.
osascript - "$MOUNT" <<'APPLESCRIPT'
on run argv
    set mountPath to (item 1 of argv) & "/"
    tell application "Finder"
        if (count of disks whose name is "Clutter") is not 1 then
            error "Eject other Clutter disk images before creating an installer"
        end if
        set targetDisk to disk "Clutter"
        if POSIX path of (targetDisk as alias) is not mountPath then
            error "Mounted disk does not match the temporary installer"
        end if
        open targetDisk
        set w to container window of targetDisk
        set current view of w to icon view
        set toolbar visible of w to false
        set statusbar visible of w to false
        set bounds of w to {200, 200, 860, 600}
        set opts to icon view options of w
        set arrangement of opts to not arranged
        set icon size of opts to 128
        set text size of opts to 13
        set background picture of opts to file ".background:installer.png" of targetDisk
        set position of item "Clutter.app" of targetDisk to {180, 170}
        set position of item "Applications" of targetDisk to {480, 170}
        close w
        open targetDisk
        delay 1
        set w to container window of targetDisk
        set bounds of w to {200, 200, 850, 590}
        delay 1
        set bounds of w to {200, 200, 860, 600}
        set toolbar visible of w to false
        set statusbar visible of w to false
        delay 3
        close w
    end tell
end run
APPLESCRIPT
# Never silently fall back to an unstyled image.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ ! -s "$MOUNT/.DS_Store" ] || break
  sleep 1
done
[ -s "$MOUNT/.DS_Store" ] || { echo "Finder did not save installer layout" >&2; exit 1; }
[ "$(readlink "$MOUNT/Applications")" = /Applications ] || { echo "Applications shortcut missing" >&2; exit 1; }
codesign --verify --deep --strict "$MOUNT/Clutter.app"
diff -qr "$APP" "$MOUNT/Clutter.app"
sync
hdiutil detach "$MOUNT"
ATTACHED=0
hdiutil convert "$WORK/layout.dmg" -format UDZO -o "$OUTPUT"
hdiutil verify "$OUTPUT"
echo "Verified styled installer: $OUTPUT"
