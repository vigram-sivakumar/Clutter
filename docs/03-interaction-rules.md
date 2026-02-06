# Interaction Rules (Keyboard Contract)

## Scope

This document defines the exact behavior of every keyboard interaction
across all node states. Once written, these rules are immutable.

---

## Definitions

- **Node**: A single editable block (paragraph, task, heading, etc.)
- **Cursor position**:
  - `START` → offset = 0
  - `MIDDLE` → 0 < offset < text.length
  - `END` → offset = text.length
- **Sibling**: Node at the same hierarchy level
- **Variant**: Node type (paragraph, task, heading, etc.)

---

## ENTER KEY — Primary Creation / Split Action

**Rule: Cursor position determines intent**

| Cursor position | Result               |
| --------------- | -------------------- |
| START           | Create sibling above |
| MIDDLE          | Split node           |
| END             | Create sibling below |

This behavior applies to all node variants.

---

### ENTER — Detailed Behavior

#### 1. Cursor at START → Sibling ABOVE

```
|Hello world
```

**Result:**

```
|
Hello world
```

- New node:
  - Same variant
  - Same parent
  - Cursor moves to new node
  - Original node unchanged

---

#### 2. Cursor at END → Sibling BELOW

```
Hello world|
```

**Result:**

```
Hello world
|
```

- New node:
  - Same variant
  - Same parent
  - Cursor moves to new node

---

#### 3. Cursor in MIDDLE → Split Node

```
Hello |world
```

**Result:**

```
Hello
|world
```

- Original node keeps text before cursor
- New node:
  - Same variant
  - Text after cursor
  - Cursor moves to start of new node

---

### ENTER — Empty Node

```
|
```

| Context               | Result                      |
| --------------------- | --------------------------- |
| Has siblings          | Create empty sibling below  |
| Only node in document | Create new empty node below |

Empty nodes are never deleted by Enter.

---

## BACKSPACE KEY — Structural Deletion / Merge

**Rule: Backspace deletes structure only at START**

---

### BACKSPACE — Detailed Behavior

#### 1. Cursor in MIDDLE or END → Delete character

Standard text deletion.

---

#### 2. Cursor at START + Node has text → Merge with previous sibling

```
|World
Hello
```

**Result:**

```
HelloWorld
```

- Current node merges into previous sibling
- Cursor placed at merge boundary
- Variant preserved from previous node

---

#### 3. Cursor at START + Node empty → Delete node

```
|
Hello
```

**Result:**

```
|Hello
```

- Node removed
- Cursor moves to previous sibling

---

#### 4. Cursor at START + Node has children

- Node not deleted
- Children are not collapsed
- Behavior defers to structural rules (future phase)

---

## TAB KEY — Hierarchy (Indent)

**TAB → Indent node**

```
Item B
|Item A
```

**Result:**

```
Item B
  |Item A
```

- Node becomes child of previous sibling
- Cursor position preserved
- No text mutation

---

### TAB — Disallowed

| Condition           | Behavior             |
| ------------------- | -------------------- |
| No previous sibling | No-op                |
| Inside code block   | No-op (future scope) |

---

## SHIFT + TAB — Outdent

**SHIFT+TAB → Outdent node**

```
Item A
  |Item B
```

**Result:**

```
|Item B
Item A
```

- Node moves up one level
- Becomes sibling of former parent
- Cursor preserved

---

## DELETE KEY

Same behavior as Backspace, but operates forward.

- Delete character if cursor not at END
- Merge with next sibling if at END
- Remove empty node if applicable

---

## GLOBAL INVARIANTS (LOCKED)

1. Cursor position is authoritative
2. Node variant does not change behavior
3. Text is never silently discarded
4. Hierarchy mutations never affect text
5. Undo always reverses exactly one logical action

---

## Non-Goals (Explicitly Out of Scope)

- Visual styling
- Animations
- Mouse interactions
- Code blocks
- Tables
- Multi-cursor

These will be defined later without violating this spec.

---

## Status

✅ Enter behavior locked and validated (Workflowy/Tana parity)  
✅ Backspace locked  
✅ Tab / Shift+Tab locked  
✅ Delete locked  
🔒 **File 03 is now canonical and immutable**

**Validation Date**: 2026-02-05  
**All 7 test cases passed**

---

## Implementation Notes

Code changes to achieve spec compliance:

- Added `insertNodeBefore()` to `NodeKernel.ts` (mirror of `insertNodeAfter`)
- Added `createSiblingAbove()` to `NodeEditor.tsx`
- Removed child-creation logic from Enter handler at START position
- Enter now creates siblings only; children created exclusively via Tab

This behavior is now frozen. Any future changes require explicit design review.

---

**Next**: File 04 — Node Variant Rules (Tasks, headings, numbered lists, callouts, etc.)
