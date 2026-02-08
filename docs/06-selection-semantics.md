# File 06 — Selection & Caret Semantics

> **⚠️ HISTORICAL REFERENCE — STATE STRUCTURE CHANGED**
> 
> **Architecture Status:** Principles preserved, state structure updated  
> **Selection Principles:** ✅ Still Valid (browser owns selection)  
> **State Structure:** ❌ Outdated (cursor model changed)
> 
> **Current Architecture:** See [`architecture/MANIFEST.md`](./architecture/MANIFEST.md)
>
> This document describes selection ownership (still correct), but uses **old cursor state structure**.
>
> **Deprecated patterns in this file:**
> - `activeNodeId` + `offset` → `cursor.nodeId` + `cursor.segmentIndex` + `cursor.offset`
> - Direct state structure references → See current EditorState
> - Extended to File 06.2 which is now DEPRECATED
>
> **Core principle remains valid:** Browser owns selection, editor observes passively.

---

**Original Status**: 🔒 LOCKED  
**Scope**: Selection behavior, not implementation  
**Version**: 1.0  
**Locked Date**: 2026-02-05

---

## Purpose of This Document

This document defines the **behavioral contract** for selection and caret in the editor.

It answers once and forever:

- Who owns caret rendering
- Who owns selection rendering
- How browser selection maps to editor state
- What selection can and cannot do
- What guarantees selection provides

**If something violates File 06, it is incorrect by definition.**

---

## 0. Core Principle (Non-Negotiable)

### The Browser Is the Single Source of Truth

```
Browser                  Editor State
───────                  ────────────
Caret rendering    →     activeNodeId + offset
Selection          →     selection.anchor/focus
Text input         →     node.text
Mouse clicks       →     [passive observation]
Drag selection     →     [passive observation]
```

**The editor state mirrors selection but never drives it.**

This is the **fundamental rule** that makes contenteditable work correctly.

---

## 1. Ownership Model (LOCKED)

### 1.1 Browser Owns (Exclusively)

The browser is responsible for:

- **Caret rendering** (blinking cursor)
- **Selection rendering** (blue highlight)
- **Mouse interaction** (click, drag, shift+click)
- **Keyboard navigation** (arrow keys, home/end)
- **IME composition** (international keyboards)
- **Native features** (double-click word select, triple-click line select)

**The editor never overrides these.**

---

### 1.2 Editor Observes (Passively)

The editor:

- **Listens** to `document.selectionchange` events
- **Reads** browser selection via `window.getSelection()`
- **Translates** DOM selection to logical editor state
- **Stores** selection in `EditorState`
- **Never** forces caret/selection position (except after destructive operations)

---

### 1.3 What "Never Drives It" Means (Critical)

**Forbidden:**

- ❌ `sel.removeAllRanges()` during normal operation
- ❌ `sel.addRange()` in response to selection changes
- ❌ Manual caret rendering (fake `<span>` elements)
- ❌ Manual selection rendering (background spans)
- ❌ `preventDefault()` on mouse events
- ❌ Fighting the browser

**Allowed (in controlled cases only):**

- ✅ Setting selection **after** destructive operations (split, delete, create)
- ✅ Setting selection **after** structural changes (indent, outdent)
- ✅ Setting selection **after** variant changes (markdown conversion)

**Rule:** If the user didn't press a key or click, don't touch selection.

---

## 2. Editor Selection State (Canonical Shape)

### 2.1 Structure (Immutable)

```typescript
EditorState {
  activeNodeId: NodeID;      // Focus node
  offset: number;            // Caret position within activeNode
  // ... other state ...
}

Selection {
  anchor: { nodeId: NodeID; offset: number } | null;
  focus:  { nodeId: NodeID; offset: number } | null;
}
```

---

### 2.2 Semantics

| State                               | Meaning                             |
| ----------------------------------- | ----------------------------------- |
| `anchor === null && focus === null` | No selection (collapsed caret)      |
| `anchor !== null && focus !== null` | Range selection                     |
| `anchor === focus`                  | Invalid state (should be null/null) |

**Normalization:**

If the browser selection has `anchor === focus` (collapsed selection), the editor normalizes this to `{ anchor: null, focus: null }` in its state representation. This prevents ambiguity and simplifies command logic.

**Direction:**

- Selection direction is preserved (anchor → focus)
- Anchor is where selection started (mouse down or shift+arrow start)
- Focus is where selection ended (mouse up or shift+arrow end)

**Offset:**

- Offset is **logical text offset** within `node.text`
- Not DOM offset
- Not visual column
- Uses Range API for correct calculation (see File 05 fix)

---

### 2.3 Active Node vs. Focus Node

- `activeNodeId` is the **focus point** of the selection
- If selection is collapsed: `activeNodeId === (no anchor/focus)`
- If selection is a range: `activeNodeId === focus.nodeId`

**Invariant:** Commands operate on `activeNodeId` + `offset`, not anchor.

---

## 3. DOM → Editor Mapping (LOCKED)

### 3.1 Observation Mechanism

**Single source:**

```typescript
document.addEventListener('selectionchange', handler);
```

**Not:**

- ❌ `onMouseDown` on `.node__content`
- ❌ `onMouseUp` on `.node__content`
- ❌ `onClick` anywhere
- ❌ Per-node selection listeners

---

### 3.2 Translation Process (Canonical Algorithm)

1. **Read browser selection:**

   ```typescript
   const sel = window.getSelection();
   ```

2. **Check if inside editor:**

   ```typescript
   if (!containerEl.contains(sel.anchorNode)) return;
   ```

3. **Find `.node__content` element:**

   ```typescript
   // Walk up DOM until .node__content
   ```

4. **Extract `data-node-id`:**

   ```typescript
   const nodeId = contentEl.getAttribute('data-node-id');
   ```

5. **Calculate logical offset using Range API:**

   ```typescript
   const range = document.createRange();
   range.selectNodeContents(contentEl);
   range.setEnd(anchorNode, anchorOffset);
   const offset = range.toString().length;
   ```

6. **Update editor state:**
   ```typescript
   setEditorState({ activeNodeId, offset });
   setSelection({ anchor, focus });
   ```

**This algorithm is immutable.**

---

### 3.3 Why Range API (Critical Detail)

**Problem:**

```html
<div class="node__content">Hello <strong>World</strong></div>
```

If cursor is in "World" at position 2:

- `anchorOffset` = 2 (local to text node) ❌ WRONG
- Logical offset = "Hello ".length + 2 = 8 ✅ CORRECT

**Range API measures from start of `.node__content`, not local text node.**

This is why `domMapping.ts` uses Range, not direct offset.

---

## 4. Behavioral Guarantees (Invariants)

### 4.1 Non-Destructive Selection

**Rule:** Selection changes **never** mutate data.

| Action         | Creates Undo? | Mutates Nodes? |
| -------------- | ------------- | -------------- |
| Click          | ❌ No         | ❌ No          |
| Drag selection | ❌ No         | ❌ No          |
| Shift+click    | ❌ No         | ❌ No          |
| Arrow keys     | ❌ No         | ❌ No          |
| Home/End       | ❌ No         | ❌ No          |

**Only keyboard commands mutate:**

- Enter
- Backspace
- Delete
- Tab
- Character input

---

### 4.2 Selection Snapshot

**Rule:** Commands operate on a **snapshot** of selection at command execution time.

```typescript
// ✅ CORRECT
function handleEnter() {
  const snapshot = { ...editorState };
  const result = applyIntent(snapshot, { type: 'enter' });
  commit(result);
}

// ❌ WRONG
function handleEnter() {
  // Selection might change during execution
  const sel = window.getSelection();
  // ... use sel later ...
}
```

---

### 4.3 Grammar Session Cancellation

**Rule:** Mouse interaction cancels grammar sessions.

**Trigger:** Any `selectionchange` event clears active grammar (/, @, #).

**Why:** User clicking away from grammar UI is an implicit cancel.

---

### 4.4 Cross-Node Selection

**Guarantee:** Selection can span multiple nodes.

**Example:**

```
Node 1: "Hello |world"
Node 2: "This is"
Node 3: "a test|"
```

Selection state:

```typescript
{
  anchor: { nodeId: "node-1", offset: 6 },
  focus:  { nodeId: "node-3", offset: 6 }
}
```

**Commands:**

- Backspace: Deletes all text + nodes in range
- Character input: Replaces entire selection
- Split: Operates only at focus point

---

## 5. Explicit Non-Goals (LOCKED)

### 5.1 What Selection Does NOT Do

**Forbidden:**

- ❌ Per-node selection state
- ❌ Inline `<span>` elements for selection rendering
- ❌ Custom selection styling (beyond CSS `::selection`)
- ❌ Editor-driven caret placement (except after ops)
- ❌ Selection history/undo
- ❌ Selection normalization ("fixing" user intent)

---

### 5.2 What Comes Later (Not Now)

**Out of scope for File 06:**

- Multi-cursor
- Block selection
- Drag-and-drop
- Copy/paste
- Rich text selection
- Link click handling

These will be defined in future phases.

---

## 6. Relationship to Other Specs

### File 03 — Keyboard Interaction

- Keyboard commands use selection snapshot
- Enter/Backspace operate on `activeNodeId` + `offset`
- Selection does not change keyboard semantics

### File 04 — Node Variants

- Selection is variant-agnostic
- Variant changes do not affect selection mapping
- Markdown shortcuts consume selection

### File 05 — Node Anatomy

- `data-node-id` on `.node__content` enables mapping
- `.node__content` is the selectable surface
- Single `contentEditable` per node

---

## 7. Implementation Requirements (Derived)

### 7.1 Required Components

**Must exist:**

- `domMapping.ts` — DOM → editor translation (pure functions)
- `document.selectionchange` listener in `NodeEditor.tsx`
- `selection` state in `EditorState`
- `data-node-id` attribute on `.node__content`

**Must NOT exist:**

- ❌ Manual caret rendering in `NodeView`
- ❌ Mouse handlers on `.node__content`
- ❌ Editor → browser sync (except post-op)

---

### 7.2 Edge Cases (Handled)

| Case                      | Behavior                       |
| ------------------------- | ------------------------------ |
| Selection outside editor  | Ignored                        |
| Selection in deleted node | Cleared                        |
| Rapid selection changes   | Debounced (implicit via React) |
| IME composition           | Native handling                |
| Multi-line paste          | Not yet defined (Phase 6)      |

---

## 8. Validation Criteria (LOCKED)

File 06 is validated when ALL of these pass:

### Mouse Interaction:

- ✅ Click places caret at click position
- ✅ Drag selects text correctly
- ✅ Shift+click extends selection
- ✅ Double-click selects word
- ✅ Triple-click selects line
- ✅ Cross-node drag selection works

### Keyboard (No Regressions):

- ✅ Arrow keys move caret
- ✅ Shift+arrow extends selection
- ✅ Home/End work
- ✅ Enter operates at cursor
- ✅ Backspace deletes selection or char

### Data Integrity:

- ✅ Selection changes don't create undo
- ✅ Click doesn't mutate nodes
- ✅ Drag doesn't mutate nodes
- ✅ Offset calculation is correct (Range API)
- ✅ Grammar cancels on click

### Performance:

- ✅ No flicker
- ✅ No cursor jumping
- ✅ No selection fighting

---

## 9. Future Considerations (Not Locked)

**May be added later:**

- Programmatic selection setting API
- Selection restoration after undo
- Selection persistence across sessions
- Accessibility enhancements (ARIA)

**But these require new spec sections, not edits to File 06.**

---

## 10. Locking Criteria

File 06 becomes **LOCKED** when:

1. ✅ All validation criteria pass
2. ✅ Phase 5.1 is manually validated
3. ✅ No open selection bugs exist
4. ✅ User confirms Workflowy/Tana parity

After locking:

- UI designers cannot reinterpret selection
- Engineers cannot "improve" selection
- Cursor AI cannot add manual caret rendering
- This document becomes constitutional

---

## Status

- ✅ Draft complete
- ✅ Validated manually against browser behavior
- ✅ **LOCKED** (2026-02-05)

**This specification is now immutable.**

Any changes require:

- Explicit design review
- New spec file (File 06.1, etc.)
- Validation against all locked files (03, 04, 05)

---

## Next Steps

**Now that File 06 is locked:**

1. ✅ Phase 5.2 — Markdown Shortcuts (safe to implement)
2. Phase 6 — Design System (visual layer)
3. Future: Copy/paste, drag-drop, multi-cursor

**This file protects selection semantics forever.**

---

## Canonical Statement (LOCK)

Any implementation that does not conform to File 06's selection model  
is considered invalid, regardless of functionality or appearance.

**Browser owns. Editor observes. Never fight.**

---

**END OF FILE 06**
