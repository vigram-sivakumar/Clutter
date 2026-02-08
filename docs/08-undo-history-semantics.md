# File 08 — Undo & History Semantics

> **⚠️ HISTORICAL REFERENCE — UNDO RULES VALID**
> 
> **Architecture Status:** Undo behavior principles preserved  
> **Undo Rules:** ✅ Still Valid (what creates history entries)  
> **State Structure:** ❌ Updated (different data model)
> 
> **Current Architecture:** See [`architecture/MANIFEST.md`](./architecture/MANIFEST.md)
>
> This document defines **undo/redo behavior** (rules correct), but references **old state structure**.
>
> **Deprecated patterns in this file:**
> - State structure references → See current EditorState
> - Text field references → Segments-based now
>
> **Undo principles remain valid:** Structural operations create entries, typing does not.

---

**Original Status**: 🔒 LOCKED  
**Scope**: Undo / Redo behavior and guarantees  
**Version**: 1.0  
**Locked Date**: 2026-02-06

---

## Purpose of This Document

This document defines the canonical meaning of **Undo** and **Redo** in the editor.

It answers, permanently:

- What an undo step represents
- What does not belong in history
- How history interacts with browser-native editing
- How atomic operations behave
- Why undo is semantic, not mechanical

**If something violates File 08, it is incorrect by definition.**

---

## 0. Core Principle (Non-Negotiable)

### Undo Represents Intent, Not Keystrokes

```
User intent  →  Editor operation  →  History snapshot
```

Undo does **not** reflect:

- Individual characters
- DOM mutations
- Timing-based batching
- Browser text events

**Undo reflects meaningful editor operations only.**

---

## 1. Ownership Model (LOCKED)

### 1.1 Browser Owns (Excluded from History)

The browser exclusively owns:

- Character insertion
- Character deletion (Backspace/Delete within a node)
- IME composition
- Cursor movement
- Selection changes
- Native text editing

**These actions never create undo history.**

---

### 1.2 Editor Owns (Included in History)

The editor owns history for:

- Structural changes
- Node-level mutations
- Variant changes
- Hierarchy changes
- Cross-node edits

**Undo history is editor-state based, not DOM-based.**

---

## 2. What Creates an Undo Step (Canonical List)

**Exactly and only** the following operations create undo entries:

### 2.1 Structural Operations

- Enter (split / create sibling above / create sibling below)
- Backspace merge (node merge)
- Node deletion
- Indent / Outdent (Tab / Shift+Tab)
- ArrowUp / ArrowDown cross-node navigation only if it mutates structure
- Collapse / Expand boundaries
- Node duplication
- Node move (future phase)

---

### 2.2 Variant & Semantic Operations

- Markdown conversion (`[]␣`, `-␣`, `#␣`, etc.)
- Slash command execution
- Variant change (paragraph → task, heading, etc.)
- Property creation / update / removal
- Template application

---

### 2.3 Document-Level Operations

- Undo / Redo itself
- Undoing a previous undo
- Document load (baseline snapshot)
- External document mutation (future sync)

---

## 3. What NEVER Creates an Undo Step (Explicitly Forbidden)

The following must **never** appear in history:

- ❌ Single-character typing
- ❌ Character deletion within a node
- ❌ Text selection
- ❌ Cursor movement
- ❌ Mouse interaction
- ❌ Drag selection
- ❌ IME composition
- ❌ Time-based batching ("group typing for 500ms")
- ❌ Heuristic grouping ("smart undo")

**These are permanently excluded.**

---

## 4. Atomicity Guarantees (Critical)

### 4.1 Single-Intent = Single Undo

Any operation triggered by one user intent must:

- Produce **exactly one** undo entry
- Either fully apply or not apply at all
- Never partially revert

**Examples:**

| Operation           | Undo Count |
| ------------------- | ---------- |
| Markdown conversion | 1          |
| Node split          | 1          |
| Node merge          | 1          |
| Template apply      | 1          |
| Property set        | 1          |

---

### 4.2 No Intermediate States

Undo must **never** reveal:

- Half-split nodes
- Consumed markdown prefixes
- Temporary cursor positions
- Transitional DOM states

**Undo always restores a fully valid editor state.**

---

## 5. History Model (LOCKED)

### 5.1 Snapshot-Based History

Undo history stores:

```typescript
EditorStateSnapshot {
  nodes: Node[];
  activeNodeId: NodeID;
  offset: number;
  selection: Selection | null;
}
```

- Full snapshot
- Immutable
- No diffs
- No patches
- No replay logic

**This is intentional.**

---

### 5.2 History Stack Rules

- Linear history only
- No branching
- New operation clears redo stack
- Max history size enforced (e.g. 100 snapshots)
- Oldest snapshots dropped silently

---

## 6. Caret & Selection Interaction

Undo / Redo may reposition caret **once**, immediately after restore.

This is allowed under **File 06.1**:

> "Editor may set caret after destructive or structural operations."

**Undo is considered a destructive operation.**

---

## 7. Relationship to Other Files

### File 03 — Keyboard Interaction

- Keyboard commands trigger undoable operations
- Typing does not

### File 06 / 06.1 — Selection & Caret

- Undo may reposition caret
- Undo never reacts to `selectionchange`

### File 07.2 — Markdown Consumption

- Markdown conversion is atomic
- Undo restores original text and variant in one step

---

## 8. Explicit Rejections (LOCKED)

The following philosophies are **explicitly rejected**:

- ❌ "Undo should feel like a text editor"
- ❌ "Undo should match Notion"
- ❌ "Undo should batch typing"
- ❌ "Undo should follow browser history"
- ❌ "Undo should be heuristic or adaptive"

**The editor is not a word processor.**

**It is a semantic node editor.**

---

## 9. Validation Criteria (LOCKED)

File 08 is valid if **all** are true:

- Ctrl+Z undoes one semantic operation
- Typing does not affect history
- Markdown undo restores original raw text
- Node split/merge undo restores exact structure
- Undo never breaks selection invariants
- No flicker
- No partial states
- No DOM-driven undo behavior

---

## 10. Canonical Statement (LOCK)

> Undo in this editor represents **meaningful intent**, not mechanical input.

> Any implementation that treats keystrokes as undoable units  
> is **incompatible with this system by design**.

---

## Status

- ✅ Draft complete
- ✅ Aligned with observed competitor behavior
- ✅ Matches current implementation
- 🔒 **LOCKED**

**Related Documents:**

- File 03 — Interaction Rules (keyboard triggers)
- File 06.1 — Caret Intervention Boundaries (undo may reposition caret)
- File 07.2 — Markdown Consumption & Undo (atomic conversion)
- ENFORCEMENT_CHECKLIST.md

**Any future changes require:**

- New file (File 08.1 or higher)
- Explicit review against entire spec framework
- Pass enforcement checklist

---

**You are now in a safe zone.**

With Files 03 → 08 locked, you can confidently proceed to:

- References
- Views
- Workspaces
- Sync
- Collaboration

**Undo will not surprise you later.**

---

**END OF FILE 08**
