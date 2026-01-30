# Collapsed Container Keyboard Behavior

**Status:** ✅ Active & Correct  
**Last Updated:** 2026-01-29

This document describes how the editor handles keyboard interactions (Enter, Tab) for collapsed toggle and task containers.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Enter Key Behavior](#enter-key-behavior)
4. [Tab Key Behavior](#tab-key-behavior)
5. [Implementation Details](#implementation-details)
6. [Edge Cases](#edge-cases)
7. [Related Documentation](#related-documentation)

---

## Overview

Toggles and tasks can be collapsed to hide their children. When collapsed, keyboard behavior must account for invisible children to provide intuitive UX.

**Container Types:**

- `listBlock` with `listType: 'toggle'`
- `listBlock` with `listType: 'task'`

**Collapse State:**

- `collapsed: true` - Children are hidden
- `collapsed: false` - Children are visible
- `collapsed` attribute is present on ALL blocks (even non-containers) for flat visibility algorithm

---

## Core Principles

### 1. Visibility Drives Behavior

**Rule:** Keyboard actions should match what the user sees, not what exists structurally.

```
Toggle▸ (collapsed) ← User sees this as a single block
  Hidden child 1    ← User doesn't see these
  Hidden child 2
```

**Result:** Enter should create a sibling, not a child (which would be invisible).

---

### 2. Auto-Expand on Tab

**Rule:** Tabbing to create a child under a collapsed container should automatically expand the parent.

**Why:** Prevents accidentally creating invisible children that the user can't see or edit.

```
Toggle▸ (collapsed)
Paragraph | ← Press Tab here

→ Becomes:

Toggle▾ (expanded)     ← Auto-expanded!
  Paragraph | ← Now indented and visible
```

---

### 3. Structural Integrity

**Rule:** Children still exist structurally even when collapsed. Operations must account for entire subtree.

**Why:** Ensures consistent document structure regardless of collapse state.

---

## Enter Key Behavior

### Scenario 1: Collapsed Container with Children

**Setup:**

```
Toggle▸ (collapsed, indent=0)
  Hidden child (indent=1)
Cursor at end of Toggle |
```

**Action:** Press Enter

**Result:**

```
Toggle▸ (collapsed, indent=0)
  Hidden child (indent=1)
New paragraph | (indent=0) ← Sibling after subtree
```

**Implementation:** `enter.ts`, lines 527-532

```typescript
// ✅ COLLAPSED CONTAINER RULE:
// If collapsed with children → create sibling AFTER subtree
if (isCollapsedContainer && hasChildren) {
  return insertSiblingBelow(editor, indent);
}
```

**Key Details:**

- `insertSiblingBelow` uses `getSubtreeEndPosition` to find insertion point after hidden children
- New block is at same indent level as parent
- Cursor moves to new block

---

### Scenario 2: Expanded Container (No Children Yet)

**Setup:**

```
Toggle▾ (expanded, indent=0)
Cursor at end of Toggle |
```

**Action:** Press Enter

**Result:**

```
Toggle▾ (expanded, indent=0)
  New paragraph | (indent=1) ← Child created
```

**Implementation:** `enter.ts`, lines 534-537

```typescript
// ✅ TOGGLE RULE:
// Expanded toggles ALWAYS create a child
if (isToggle && isExpandedContainer) {
  return insertFirstChild(editor, indent);
}
```

---

### Scenario 3: Expanded Container (Has Children)

**Setup:**

```
Toggle▾ (expanded, indent=0)
  Existing child (indent=1)
Cursor at end of Toggle |
```

**Action:** Press Enter

**Result:**

```
Toggle▾ (expanded, indent=0)
  Existing child (indent=1)
Cursor moves into first child ← No new block created
```

**Implementation:** General "end of block" logic checks `hasChildren` and does nothing (cursor naturally flows into first child).

---

## Tab Key Behavior

### Scenario 1: Tab Under Collapsed Container

**Setup:**

```
Toggle▸ (collapsed, indent=0)
  Hidden child (indent=1)
Paragraph (indent=0) | ← Cursor here
```

**Action:** Press Tab

**Result:**

```
Toggle▾ (expanded, indent=0) ← Auto-expanded!
  Hidden child (indent=1)
  Paragraph (indent=1) | ← Now a child, visible
```

**Implementation:** `tab.ts`, lines 196-217

```typescript
// AUTO-EXPAND COLLAPSED PARENT:
// Find last VISIBLE block (skip hidden children)
let prevVisibleBlock = null;
for (let i = selectedIndex - 1; i >= 0; i--) {
  if (isVisible[i]) {
    prevVisibleBlock = blocks[i];
    break;
  }
}

if (prevVisibleBlock && !isShift && newIndent === prevVisibleBlock.indent + 1) {
  const isCollapsed = prevVisibleBlock.node.attrs?.collapsed === true;
  const isToggleOrTask = /* ... */;

  if (isCollapsed && isToggleOrTask) {
    updateBlockAttrs(tr, prevVisibleBlock.pos, {
      collapsed: false, // ✅ Expand!
    });
  }
}
```

**Key Details:**

- Visibility tracking prevents finding hidden siblings as "prev block"
- Auto-expand only triggers when creating parent-child relationship (`newIndent === parentIndent + 1`)
- Works for both toggles and tasks

---

### Scenario 2: Tab Under Expanded Container

**Setup:**

```
Toggle▾ (expanded, indent=0)
Paragraph (indent=0) | ← Cursor here
```

**Action:** Press Tab

**Result:**

```
Toggle▾ (expanded, indent=0)
  Paragraph (indent=1) | ← Indented, visible
```

**Implementation:** No special handling needed. Standard indent operation.

---

## Implementation Details

### Visibility Tracking Algorithm

Both `enter.ts` and `tab.ts` use the same visibility algorithm from `CollapsePlugin`:

```typescript
// Track which blocks are hidden by collapsed parents
const isVisible: boolean[] = new Array(blocks.length).fill(true);
let hiddenIndent: number | null = null;

for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];

  // If we're hiding, check if this block should remain hidden
  if (hiddenIndent !== null && block.indent > hiddenIndent) {
    isVisible[i] = false;
    continue;
  }

  // This block is visible
  // If this block is collapsed, start hiding deeper blocks
  if (block.collapsed) {
    hiddenIndent = block.indent;
  }
  // If we were hiding and this block is at same/less indent, stop hiding
  else if (hiddenIndent !== null && block.indent <= hiddenIndent) {
    hiddenIndent = null;
  }
}
```

**Why:** Ensures keyboard handlers see the same visibility state as `CollapsePlugin` decorations.

---

### Finding Previous Visible Block

When Tab needs to find the parent, it must skip hidden siblings:

```typescript
// ❌ WRONG: Finds hidden child
const prevBlock = blocks[selectedIndex - 1];

// ✅ CORRECT: Finds last visible block
let prevVisibleBlock = null;
for (let i = selectedIndex - 1; i >= 0; i--) {
  if (isVisible[i]) {
    prevVisibleBlock = blocks[i];
    break;
  }
}
```

**Without this fix:**

```
Toggle▸ (collapsed, indent=0)
  Hidden child (indent=1) ← Would be found as "prev block"
Paragraph (indent=0) | ← Press Tab
```

Result would be:

- `prevBlock.indent = 1`
- `newIndent = 1` (paragraph going from 0 → 1)
- Check: `1 === 1 + 1` → **FALSE** ❌
- No auto-expand!

**With the fix:**

- `prevVisibleBlock.indent = 0` (the Toggle)
- `newIndent = 1`
- Check: `1 === 0 + 1` → **TRUE** ✅
- Auto-expand!

---

### Subtree End Position

`insertSiblingBelow` uses `getSubtreeEndPosition` to find where to insert:

```typescript
function getSubtreeEndPosition(
  state: EditorState,
  blockPos: number,
  blockIndent: number
): number {
  const doc = state.doc;
  let pos = blockPos;

  // Walk forward, including all deeper-indented blocks
  doc.nodesBetween(blockPos, doc.content.size, (node, nodePos) => {
    if (node.attrs?.blockId) {
      const nodeIndent = node.attrs.indent ?? 0;
      if (nodeIndent > blockIndent) {
        pos = nodePos + node.nodeSize;
      } else if (nodePos > blockPos) {
        return false; // Stop at first block not deeper
      }
    }
  });

  return pos;
}
```

**Why:** Ensures siblings are inserted after ALL children (including hidden ones), maintaining structural integrity.

---

## Edge Cases

### Edge Case 1: Nested Collapsed Containers

**Setup:**

```
Toggle▸ (collapsed, indent=0)
  Toggle▸ (collapsed, indent=1) ← Hidden
    Child (indent=2) ← Also hidden
Paragraph (indent=0) | ← Press Enter
```

**Result:**

```
Toggle▸ (collapsed, indent=0)
  Toggle▸ (collapsed, indent=1)
    Child (indent=2)
New paragraph | (indent=0) ← After entire subtree
```

**Why it works:** `getSubtreeEndPosition` walks the entire subtree recursively, finding all descendants regardless of collapse state.

---

### Edge Case 2: Collapsed Container at Indent > 0

**Setup:**

```
Paragraph (indent=0)
  Toggle▸ (collapsed, indent=1)
    Hidden child (indent=2)
Paragraph (indent=0) | ← Press Tab to indent
```

**Result:**

```
Paragraph (indent=0)
  Toggle▾ (expanded, indent=1) ← Auto-expanded!
    Hidden child (indent=2)
    Paragraph (indent=2) | ← Now a child
```

**Why it works:** Auto-expand logic doesn't check absolute indent level, only parent-child relationship.

---

### Edge Case 3: Shift+Tab (Outdent)

**Setup:**

```
Toggle▸ (collapsed, indent=0)
  Paragraph (indent=1) | ← Hidden, cursor here
```

**Action:** Press Shift+Tab

**Result:**

```
Toggle▸ (collapsed, indent=0)
Paragraph (indent=0) | ← Outdented, now visible
```

**Why it works:** Outdent doesn't trigger auto-expand (only indent does). Paragraph becomes visible because it's no longer a child of the collapsed toggle.

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Keyboard handler contract
- [enter.ts](./keymaps/enter.ts) - Enter key implementation
- [tab.ts](./keymaps/tab.ts) - Tab key implementation
- [CollapsePlugin.ts](../CollapsePlugin.ts) - Visibility algorithm
- [BLOCKS_COMPLETE_REFERENCE.md](../../../BLOCKS_COMPLETE_REFERENCE.md) - Block types reference

---

## Change Log

**2026-01-29 (Created)**

**Bugs Fixed:**

1. **Enter in Collapsed Container** - Now creates sibling after subtree, not invisible child
2. **Tab Auto-Expand** - Now finds correct visible parent, not hidden sibling
3. **Visibility Tracking** - Both Enter and Tab use same algorithm as CollapsePlugin

**Key Learnings:**

- Visibility must be computed before any keyboard logic
- Structural operations (Enter, Tab) must account for hidden children
- Auto-expand prevents accidentally creating invisible blocks
- `getSubtreeEndPosition` is critical for maintaining document integrity

---

**Questions?** See implementation in:

- `packages/editor/plugins/keyboard/keymaps/enter.ts`
- `packages/editor/plugins/keyboard/keymaps/tab.ts`
- `packages/editor/plugins/CollapsePlugin.ts`
