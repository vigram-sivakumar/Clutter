#!/bin/bash
# usage: safekey.sh <waitSeconds> <keycode>...
# Presses keys only while the sandbox test app's system file panel is up. The test app is identified by its bundle
# identifier (the dev build shares the executable name "app"), and is brought to the front first.
WAIT=$1; shift
osascript - "$WAIT" "$@" <<'AS'
on run argv
  set maxWait to (item 1 of argv) as integer
  set ready to false
  tell application "System Events"
    repeat maxWait times
      if exists (process "com.apple.appkit.xpc.openAndSavePanelService") then
        set targets to (every process whose bundle identifier is "com.clutter.sandboxtest")
        if (count of targets) > 0 then
          set theApp to item 1 of targets
          if frontmost of theApp is false then set frontmost of theApp to true
          delay 0.8
          if frontmost of theApp is true then
            set ready to true
            exit repeat
          end if
        end if
      end if
      delay 1
    end repeat
    if ready is false then return "panel not up: no key sent"
    delay 1
    repeat with i from 2 to (count of argv)
      key code ((item i of argv) as integer)
      delay 0.6
    end repeat
  end tell
  return "sent"
end run
AS
