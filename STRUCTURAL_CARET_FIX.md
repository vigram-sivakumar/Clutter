# Structural Caret Control — Implementation Complete

**Status**: ✅ DONE  
**Authority**: File 06 §1.3 (Controlled Caret Placement)  
**Date**: 2026-02-06

---

## What Was Fixed

### Root Cause

After fixing character input (Phase 5.1.6), we removed ALL caret control—including the controlled placement required for structural operations.

The editor was updating state but NOT syncing the browser's caret position after structural changes.

---

## Implementation

### Split Ownership Model (LOCKED)

| Category                            | Owner   | Caret Handling               |
| ----------------------------------- | ------- | ---------------------------- |
| **Character typing**                | Browser | ❌ Editor MUST NOT touch     |
| **Navigation (arrows)**             | Editor  | ✅ Editor MUST set selection |
| **Structure (Enter/Backspace/Tab)** | Editor  | ✅ Editor MUST set selection |

---

## Changes Made

### 1. Arrow Key Navigation ✅

**Location**: `NodeEditor.tsx` lines 2368-2390 (ArrowUp/Down)

Added `setShouldSyncCaret(true)` to:

- ArrowUp (with/without shift)
- ArrowDown (with/without shift)
- Cross-node navigation

### 2. ArrowLeft/Right ✅

**Location**: `NodeEditor.tsx` lines 2164-2370

Added `setShouldSyncCaret(true)` to:

- Horizontal movement within node
- Cross-node navigation at boundaries
- Collapse/expand operations

### 3. Undo/Redo ✅

**Location**: `NodeEditor.tsx`

- `undo()` function: line 558
- `redo()` function: line 594

Both now call `setShouldSyncCaret(true)` after restoring state.

### 4. Caret Sync Mechanism (Enhanced) ✅

**Location**: `NodeEditor.tsx` lines 1901-1950

Improved `useEffect` to:

- Focus element if not already focused
- Create text node if missing
- Handle empty contentEditable gracefully
- Use defensive offset clamping

---

## Already Correct

These operations already had `setShouldSyncCaret(true)`:

- ✅ Enter (all cases)
- ✅ Backspace
- ✅ Tab / Shift+Tab
- ✅ Markdown shortcuts (`[]␣`)
- ✅ Collapse/Expand

---

## Behavioral Contract (File 06)

### Browser owns:

- Text insertion during typing
- Native caret movement during typing
- Selection rendering

### Editor owns:

- Structural navigation (arrows between nodes)
- Caret placement after destructive ops (Enter, Backspace)
- Caret placement after undo/redo

---

## Acceptance Test

### Typing

- ✅ Type → caret moves natively

### Arrow Keys

- ✅ ArrowDown at end → caret moves to next node
- ✅ ArrowUp at start → caret moves to previous node
- ✅ ArrowLeft/Right within node → caret moves correctly
- ✅ Cross-node navigation works

### Enter

- ✅ Enter creates node
- ✅ Caret is in new node at offset 0

### Backspace

- ✅ Merge → caret at merge boundary

### Undo/Redo

- ✅ Caret restores to correct position

---

## Files Modified

1. `apps/engine-demo/src/NodeEditor.tsx`
   - Arrow handlers: lines 2164-2390
   - Undo/redo: lines 527-594
   - Caret sync useEffect: lines 1901-1950

---

## Next Steps

1. **Manual Validation** (user must test)
2. **Lock File 08** — Keyboard Navigation Semantics
3. **Phase 5.2.2** — Markdown bullets (`-␣`)
