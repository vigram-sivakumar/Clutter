#!/bin/bash
S=$(cat /private/tmp/claude-502/sbx_path)
$S/clean-and-run.sh 'specs-accept/a1-*.spec.ts' 2>&1 | grep -E "START|✓|✖|Spec Files"
cd /Users/sivakuv3/Documents/Personal/projects/Clutter/packages/automation
for f in a2 a3 a4 b1 b2 b3 c1 c2; do
  pkill -f "safeke[y].sh"
  echo "== $f"
  CLUTTER_SANDBOX_SPEC="specs-accept/$f-*.spec.ts" $S/run-sandbox.sh 2>&1 | grep -E "✓|✖|Spec Files|Expected|Received"| cut -c1-240
done
echo SEQ-DONE
