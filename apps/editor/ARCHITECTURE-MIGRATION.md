# Architecture Migration Guide

## Status: IN PROGRESS

This document tracks the migration from monolithic NodeEditor to the new coordinated architecture.

## Completed Steps

### ✅ Step 1: EditorTypes.ts
**Location:** `src/editor/core/EditorTypes.ts`
- Defined complete state shape
- Defined all action types
- Defined handler result types
- Defined coordinator context

### ✅ Step 2: EditorStateReducer.ts
**Location:** `src/editor/core/EditorStateReducer.ts`
- Implemented pure reducer for all actions
- Handles: ENTER, BACKSPACE, ARROW, TAB, SELECTION_CHANGED, BLUR_COMMIT, COMPOSITION, ZOOM, GRAMMAR
- Exports `useEditorStateReducer` hook

### ✅ Step 3: KeyboardHandlers.ts
**Location:** `src/editor/handlers/KeyboardHandlers.ts`
- Pure functions for Enter, Backspace, Arrow, Tab
- Master `handleKeyboardEvent` router
- Zero state mutations

### ✅ Step 4: SelectionHandlers.ts
**Location:** `src/editor/handlers/SelectionHandlers.ts`
- Pure functions for selection change, blur, composition
- Uses existing `getNodePositionFromSelection` from domMapping
- Zero state mutations

### ✅ Step 5: EditorCoordinator.ts
**Location:** `src/editor/core/EditorCoordinator.ts`
- Single `execute()` entry point
- Orchestrates: stop observers → extract DOM → dispatch → request caret
- Structural vs non-structural operation handling
- Uses `scheduleRAF` from Priority 1

### ✅ Step 6: NodeEditorCore.tsx (Blueprint)
**Location:** `src/editor/core/NodeEditorCore.tsx`
- Demonstrates complete new architecture
- Shows ideal structure after full migration
- ~200 lines (vs 4,668 in current NodeEditor)

## Current Step: Integration

### Step 6: Wire Into NodeEditor.tsx

**Goal:** Replace inline handler logic in NodeEditor.tsx with coordinator calls while preserving all existing functionality.

**Strategy:** Incremental replacement, one handler at a time.

#### 6.1: Add Imports

Add at top of NodeEditor.tsx:

```typescript
import { useEditorStateReducer } from './editor/core/EditorStateReducer';
import { createEditorCoordinator } from './editor/core/EditorCoordinator';
import { handleKeyboardEvent as handleKeyPure } from './editor/handlers/KeyboardHandlers';
import type { EditorStateComplete } from './editor/core/EditorTypes';
```

#### 6.2: Add Coordinator Setup

After `modelRef` initialization:

```typescript
// NEW ARCHITECTURE: Coordinator for operation orchestration
const coordinator = useMemo(
  () =>
    createEditorCoordinator(dispatch, {
      domObservers,
      modelRef,
      needsCaretPlacementRef,
      structuralLockRef,
    }),
  [dispatch]
);
```

#### 6.3: Migration Targets

**Priority Order (high to low risk):**

1. **Tab Handler** (Low Risk)
   - Lines: 2734-2789
   - Replace with coordinator call
   - Current: Manual indent/outdent + withStructuralCommit
   - New: Pure handler → coordinator

2. **Arrow Up/Down Handler** (Medium Risk)
   - Lines: 2895-2990
   - Replace with coordinator call  
   - Current: Manual extract + navigation + commit
   - New: Pure handler → coordinator

3. **Enter Handler** (High Risk)  
   - Lines: 3156-3400+
   - Most complex, deeply integrated
   - Current: Complex commit boundary with multiple cases
   - New: Pure handler → coordinator
   - **NOTE:** Keep grammar mode handling separate

4. **Backspace Handler** (High Risk)
   - Lines: 3400+
   - Complex merge logic
   - Current: Manual observer stop + extract + merge
   - New: Pure handler → coordinator

#### 6.4: Example Replacement (Tab Handler)

**BEFORE:**
```typescript
if (e.key === 'Tab') {
  e.preventDefault();
  if (e.shiftKey) {
    const newState = outdentNode(editorState);
    // ... 20 lines of manual orchestration ...
    withStructuralCommit(() => {
      commit({ nodes: newState.nodes, cursor: editorState.cursor });
      requestCaretPlacement();
    });
  } else {
    const newState = indentNode(editorState);
    // ... 20 lines of manual orchestration ...
    withStructuralCommit(() => {
      commit({ nodes: newState.nodes, cursor: editorState.cursor });
      requestCaretPlacement();
    });
  }
  return;
}
```

**AFTER:**
```typescript
if (e.key === 'Tab') {
  const result = handleKeyPure(editorState, e, isComposing);
  if (result.preventDefault) e.preventDefault();
  if (result.stopPropagation) e.stopPropagation();
  if (result.action) {
    coordinator.execute(result.action);
  }
  return;
}
```

**Line Reduction:** ~40 lines → ~8 lines (80% reduction)

#### 6.5: Preservation Rules

**DO NOT TOUCH (Keep As-Is):**
- Grammar mode handlers (lines 2545-2638)
- Undo/Redo (lines 2640-2656)
- Keyboard shortcuts (Cmd+R, Cmd+E, etc.)
- Reference picker
- Query bar
- View/Template management
- Markdown shortcuts
- ArrowLeft/Right (tree operations)

**REASON:** These are orthogonal features, not core editor operations.

## Testing Strategy

After each handler migration:

1. **Manual Testing:**
   - Test basic typing
   - Test Enter (node split)
   - Test Backspace (node merge)
   - Test Tab/Shift+Tab (indent/outdent)
   - Test Arrow Up/Down (navigation)

2. **Regression Checklist:**
   - No cursor jumps
   - No re-renders during typing
   - Observers start/stop correctly
   - Segments sync from DOM
   - Model stays in sync

3. **Automated Tests:** (Step 7)
   - Unit tests for reducer
   - Unit tests for handlers
   - Integration tests for coordinator

## Success Metrics

### Quantitative
- [ ] NodeEditor.tsx: <2000 lines (from 4,668)
- [ ] Max function length: <100 lines
- [ ] Handlers migrated: 4/4 (Tab, Arrow, Enter, Backspace)
- [ ] Test coverage: >80%

### Qualitative
- [ ] No inline orchestration in handlers
- [ ] All structural operations go through coordinator
- [ ] State changes only through reducer
- [ ] Caret placement only through hook

## Next Steps

1. **Implement Step 6.2:** Add coordinator to NodeEditor.tsx
2. **Migrate Tab Handler** (6.3.1)
3. **Migrate Arrow Handler** (6.3.2)
4. **Migrate Enter Handler** (6.3.3)
5. **Migrate Backspace Handler** (6.3.4)
6. **Step 7:** Add comprehensive tests

## Notes

- Original NodeEditor.tsx preserved as NodeEditor.tsx.backup
- Migration is incremental - both patterns coexist temporarily
- Each migration step is a separate commit
- Rollback plan: revert individual commits if issues arise
