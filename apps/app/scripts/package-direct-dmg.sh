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

mkdir -p "$WORK/source" "$MOUNT"
ditto "$APP" "$WORK/source/Clutter.app"
ln -s /Applications "$WORK/source/Applications"
hdiutil create -volname Clutter -srcfolder "$WORK/source" -fs HFS+ -format UDRW "$WORK/layout.dmg"
hdiutil attach "$WORK/layout.dmg" -noautoopen -mountpoint "$MOUNT"
ATTACHED=1

# Finder persists the installation presentation in the image's .DS_Store.
# Resolve the exact mounted folder, not a Finder disk name. The temporary
# mount must be browsable so Finder can persist its own window metadata.
# This requires an interactive macOS release session and Finder automation access.
osascript - "$MOUNT" <<'APPLESCRIPT'
on openInstaller(mountAlias)
    set expectedPath to POSIX path of mountAlias
    tell application "Finder"
        open mountAlias
        repeat 20 times
            delay 0.25
            try
                set w to front Finder window
                if (POSIX path of (target of w as alias)) is expectedPath then return w
            end try
        end repeat
        error "Finder did not open the temporary installer mount"
    end tell
end openInstaller

on run argv
    set mountAlias to (POSIX file (item 1 of argv)) as alias
    tell application "Finder"
        set w to my openInstaller(mountAlias)
        set targetFolder to target of w
        set current view of w to icon view
        set toolbar visible of w to false
        set statusbar visible of w to false
        set bounds of w to {200, 200, 800, 500}
        set opts to icon view options of w
        set arrangement of opts to not arranged
        set icon size of opts to 128
        set text size of opts to 13
        -- Leave the native Finder background and global path bar preference unchanged.
        set position of item "Clutter.app" of targetFolder to {160, 120}
        set position of item "Applications" of targetFolder to {440, 120}
        close w
        set w to my openInstaller(mountAlias)
        set bounds of w to {200, 200, 790, 490}
        delay 1
        set bounds of w to {200, 200, 800, 500}
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
python3 -I "$HERE/compare-bundles.py" "$APP" "$MOUNT/Clutter.app"
sync
hdiutil detach "$MOUNT"
ATTACHED=0
hdiutil convert "$WORK/layout.dmg" -format ULFO -o "$OUTPUT"
hdiutil verify "$OUTPUT"
echo "Verified styled installer: $OUTPUT"
