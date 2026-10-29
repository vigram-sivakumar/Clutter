#!/bin/bash
S=$(cat /private/tmp/claude-502/sbx_path)
cd /Users/sivakuv3/Documents/Personal/projects/Clutter/packages/automation
for f in a4 b1 b2 b3; do
  pkill -f safekey.sh
  echo "== $f"
  CLUTTER_SANDBOX_SPEC="specs-accept/$f-*.spec.ts" $S/run-sandbox.sh 2>&1 | grep -E "✓|✖|Spec Files|BODY|Error:|Expected|Received" | cut -c1-260
done
echo SEQ-DONE
