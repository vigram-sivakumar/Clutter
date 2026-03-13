#!/bin/bash
set -e

echo "🔒 CHECKING ARCHITECTURAL LOCKS..."
echo ""

# Check 1: Only one editor exists
echo "✓ Checking for duplicate editors..."
EDITOR_COUNT=$(find apps -name "*Editor.tsx" -o -name "*Editor.ts" 2>/dev/null | grep -v "SegmentedEditor\|node_modules\|dist" | wc -l | tr -d ' ')
if [ "$EDITOR_COUNT" -gt 1 ]; then
  echo "❌ FAIL: Multiple editors found!"
  find apps -name "*Editor.tsx" -o -name "*Editor.ts" | grep -v "SegmentedEditor\|node_modules\|dist"
  exit 1
fi
echo "   ✅ Single editor confirmed (apps/engine-demo/src/NodeEditor.tsx)"

# Check 2: No legacy files exist
echo ""
echo "✓ Checking for legacy artifacts..."
if [ -d "packages/editor" ]; then
  echo "❌ FAIL: packages/editor/ still exists!"
  exit 1
fi
if [ -d "apps/desktop" ]; then
  echo "❌ FAIL: apps/desktop/ still exists!"
  exit 1
fi
if [ -f "apps/engine-demo/src/engine/InlineMetadata.ts" ]; then
  echo "❌ FAIL: InlineMetadata.ts still exists!"
  exit 1
fi
echo "   ✅ No legacy files found"

# Check 3: No forbidden patterns in code
echo ""
echo "✓ Checking for forbidden patterns..."

check_pattern() {
  local pattern="$1"
  local message="$2"
  # Exclude: comments, hardening docs, test files with @ts-expect-error
  local matches=$(grep -r "$pattern" apps/engine-demo/src --include="*.ts" --include="*.tsx" 2>/dev/null | \
    grep -v "hardening/forbidden\|hardening/README\|node_modules\|//" | \
    grep -v "^\s*\*")
  
  # For each match, check if previous line has @ts-expect-error
  local violations=""
  while IFS= read -r line; do
    if [ -n "$line" ]; then
      local file=$(echo "$line" | cut -d: -f1)
      local linenum=$(echo "$line" | cut -d: -f2 | grep -o "^[0-9]*")
      
      if [ -n "$linenum" ]; then
        local prevline=$(sed -n "$((linenum-1))p" "$file" 2>/dev/null)
        if [[ ! "$prevline" =~ "@ts-expect-error" ]]; then
          violations="$violations\n$line"
        fi
      fi
    fi
  done <<< "$matches"
  
  if [ -n "$violations" ] && [ "$violations" != "\n" ]; then
    echo "❌ FAIL: Found forbidden pattern: $pattern"
    echo "$message"
    echo -e "$violations"
    return 1
  fi
  return 0
}

FAILED=0

check_pattern "node\.text" "node.text is forbidden - use getPlainText(node.segments)" || FAILED=1
check_pattern "node\.meta" "node.meta is forbidden - segments only" || FAILED=1
check_pattern "extractPureText" "extractPureText is forbidden - use getPlainText()" || FAILED=1
check_pattern "CursorBias" "CursorBias is forbidden - use CursorPosition" || FAILED=1
check_pattern "NodeWithMeta" "NodeWithMeta is forbidden - use Node" || FAILED=1
check_pattern "InlineMeta" "InlineMeta is forbidden - use Segment" || FAILED=1

if [ $FAILED -eq 0 ]; then
  echo "   ✅ No forbidden patterns found"
else
  echo ""
  echo "❌ ARCHITECTURE LOCK FAILED"
  exit 1
fi

# Check 4: Hardening infrastructure exists
echo ""
echo "✓ Checking hardening infrastructure..."
if [ ! -f "apps/engine-demo/src/hardening/invariants.ts" ]; then
  echo "❌ FAIL: invariants.ts missing!"
  exit 1
fi
if [ ! -f "apps/engine-demo/src/hardening/keyboard-ownership.ts" ]; then
  echo "❌ FAIL: keyboard-ownership.ts missing!"
  exit 1
fi
if [ ! -f "apps/engine-demo/src/hardening/split-state-machine.ts" ]; then
  echo "❌ FAIL: split-state-machine.ts missing!"
  exit 1
fi
echo "   ✅ Hardening infrastructure present"

# Check 5: Core editor files are present
echo ""
echo "✓ Checking core editor files..."
REQUIRED_FILES=(
  "apps/engine-demo/src/NodeEditor.tsx"
  "apps/engine-demo/src/NodeView.tsx"
  "apps/engine-demo/src/editor/SegmentOps.ts"
  "apps/engine-demo/src/editor/SegmentedEditor.ts"
  "apps/engine-demo/src/editor/SegmentQuery.ts"
  "apps/engine-demo/src/editor/index.ts"
  "apps/engine-demo/src/engine/NodeKernel.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ FAIL: Required file missing: $file"
    exit 1
  fi
done
echo "   ✅ All core editor files present"

echo ""
echo "🎯 ALL ARCHITECTURAL LOCKS VERIFIED ✅"
echo ""
echo "Architecture is secure:"
echo "  • Single editor enforced"
echo "  • Legacy fully removed"
echo "  • Forbidden patterns blocked"
echo "  • Hardening infrastructure active"
