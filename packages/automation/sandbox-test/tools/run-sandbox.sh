#!/bin/bash
cd /Users/sivakuv3/Documents/Personal/projects/Clutter/packages/automation
export CLUTTER_SANDBOX_BINARY="/private/tmp/claude-502/-Users-sivakuv3-Documents-Personal-projects-Clutter/4e60ca58-be4e-4a59-9d79-e040a09e61c4/scratchpad/sandbox/target/release/bundle/macos/Clutter Sandbox Test.app/Contents/MacOS/app"
export CLUTTER_FAKE_HOME="/Users/sivakuv3/Library/Containers/com.clutter.sandboxtest/Data"
npx wdio run sandbox-test/wdio.sandbox.conf.ts 2>&1
