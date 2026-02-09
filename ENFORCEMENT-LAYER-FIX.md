# Enforcement Layer Fix — performEditorOperation Removal

**Date:** 2026-02-04
**Issue:** `EditorModel not initialized` error on Enter key press
**Root Cause:** Enforcement wrapper incompatible with unified model architecture
**Status:** ✅ FIXED

---

## Problem Statement

After fixing the zombie node bug by unifying on `modelRef.current`, the Enter handler crashed with:

```
Uncaught Error: EditorModel not initialized
    at getModel (EditorModel.ts:49:11)
    at performEditorOperation (CommitPipeline.ts:130:17)
    at handleKeyDown (NodeEditor.tsx:3307:7)
```

---

## Root Cause

The `performEditorOperation` enforcement wrapper was built around the **old singleton model** architecture:

```typescript
export function performEditorOperation(operation: EditorOperation): void {
  // ❌ Tries to get old singleton model
  const model = getModel();
  if (!model) {
    throw new Error('EditorModel not initialized');
  }

  // ❌ Flushes to singleton
  const flushedNodes = flushTypingChanges(model.nodes);
  updateModel(flushedNodes, model.cursor);

  // Execute operation
  const result = operation.execute();

  // ❌ Updates singleton again
  updateModel(result.nodes, result.cursor);

  // Updates React
  _setEditorStateInternal({ nodes: result.nodes, cursor: result.cursor });
}
```

**Problem:** We removed `initializeModel()` to fix the dual-model bug, so `getModel()` now throws.

---

## Why Not Fix performEditorOperation?

### Option A: Fix it to use modelRef ❌

**Problems:**

1. Would need to pass `modelRef` as a parameter (breaks encapsulation)
2. Creates coupling between enforcement layer and component internals
3. Redundant work (handler already updates model and places caret)
4. Architectural mismatch (enforcement layer shouldn't manage model state)

### Option B: Remove it entirely ✅

**Advantages:**

1. Enter handler already does everything needed:
   - Reads from `modelRef.current`
   - Stops observers
   - Extracts segments
   - Splits nodes
   - Updates model
   - Commits to React
   - Places caret
2. Matches Backspace handler pattern (uses `withStructuralCommit` + `commit()`)
3. Simpler, clearer, no redundancy
4. Compatible with unified model architecture

---

## The Fix

### Before (Using performEditorOperation)

```typescript
performEditorOperation({
  type: 'Enter',
  execute: () => {
    const nodes = modelRef.current!.getNodes();
    // ...split logic...
    modelRef.current!.updateState(newNodes, newCursor);

    // Return for pipeline (performEditorOperation will call updateModel again)
    return {
      nodes: newNodes,
      cursor: { nodeId: tail.id, segmentIndex: 0, offset: 0 },
    };
  },
});
```

**Issues:**

- Handler updates `modelRef.current`
- `performEditorOperation` tries to update singleton → **crash**
- Redundant state updates
- Complex execution flow

---

### After (Using withStructuralCommit)

```typescript
e.preventDefault();

withStructuralCommit(() => {
  const nodes = modelRef.current!.getNodes();
  // ...split logic...

  // Update model instance
  modelRef.current!.updateState(newNodes, newCursor);

  // Commit to React
  commit({
    nodes: newNodes,
    cursor: { nodeId: tail.id, segmentIndex: 0, offset: 0 },
  });

  // Place caret
  requestAnimationFrame(() => {
    requestCaretPlacement();
  });
});
```

**Benefits:**

- Direct execution, no wrapper overhead
- Single model update path
- Matches Backspace handler pattern
- Clear, linear flow

---

## Changes Made

### 1. Enter Handler (Lines 3303-3408)

**Removed:** `performEditorOperation` wrapper

**Added:**

- `e.preventDefault()` (explicit)
- `withStructuralCommit(() => { ... })` wrapper
- Explicit `commit()` call
- Early returns instead of returning fallback state

**Pattern:** Now matches Backspace handler architecture

---

### 2. Imports (Lines 129-139)

**Removed/Commented:**

```typescript
// performEditorOperation,  // ❌ Uses old singleton model
// captureSelectionIntent,  // Unused
// type EditorOperation,  // Unused
```

**Kept:**

- `_initializePipeline`
- `_initializeStateWrapper`
- `_allowMutation`
- `_blockMutation`
- `assertNotRenderingDuringTyping`

---

## Architectural Impact

### Enforcement Layer Role (Clarified)

**What it SHOULD do:**
✅ Provide infrastructure (pipeline initialization, state wrapper)
✅ Mutation guards (`_allowMutation`, `_blockMutation`)
✅ Development assertions (`assertNotRenderingDuringTyping`)

**What it SHOULD NOT do:**
❌ Manage model state (that's `modelRef.current`'s job)
❌ Wrap every operation (that's `withStructuralCommit`'s job)
❌ Duplicate work handlers already do

---

### Handler Patterns (Unified)

**All structural handlers now follow the same pattern:**

```typescript
e.preventDefault();

withStructuralCommit(() => {
  // 1. Read from modelRef.current
  const nodes = modelRef.current!.getNodes();

  // 2. Stop observers
  observer.stop();

  // 3. Extract from DOM
  const segments = extractSegmentsFromDOM(element);

  // 4. Perform structural operation
  const result = structuralOperation(node, cursor);

  // 5. Update model instance
  modelRef.current!.updateState(newNodes, newCursor);

  // 6. Commit to React
  commit({ nodes: newNodes, cursor: newCursor });

  // 7. Place caret (after render)
  requestAnimationFrame(() => {
    requestCaretPlacement();
  });
});
```

**Used by:**

- ✅ Enter handler
- ✅ Backspace handler
- ✅ (Future: Delete, Tab/Shift+Tab refactor)

---

## Verification

### Build Status

✅ **Passes** (aside from pre-existing unrelated errors)

### Runtime Behavior

✅ **No crash** on Enter key press
✅ **Model updates correctly** (no zombie nodes)
✅ **Caret placement works** (requestCaretPlacement after render)
✅ **Observer lifecycle correct** (React manages via useEffect)

---

## Next Steps (Future Cleanup)

### 1. Deprecate CommitPipeline.ts

The `performEditorOperation` function is now **unused** and **incompatible**. Consider:

- Marking it as `@deprecated`
- Moving mutation guards to separate module
- Deleting the entire `CommitPipeline.ts` once all handlers are migrated

### 2. Unified Handler Contract

Document the standard handler pattern:

```markdown
# Structural Handler Contract

All handlers that change node count MUST:

1. Use `withStructuralCommit(() => { ... })`
2. Read from `modelRef.current` (NEVER from React state)
3. Stop observers explicitly
4. Update `modelRef.current` first
5. Then call `commit()`
6. Use `requestAnimationFrame` for caret placement
```

### 3. Audit Remaining Enforcement Usage

Check if any code still uses:

- `performEditorOperation` (should be zero)
- `captureSelectionIntent` (might be dead code)
- `EditorOperation` type (might be dead code)

---

## Lessons Learned

### 1. Wrappers Create Coupling

The `performEditorOperation` wrapper tightly coupled handlers to the singleton model. When we changed the model architecture, the wrapper became incompatible.

**Lesson:** Avoid heavyweight wrappers. Prefer small, focused utilities.

---

### 2. Enforcement ≠ Orchestration

The enforcement layer should **guard** operations, not **orchestrate** them.

**Bad (Orchestration):**

```typescript
performEditorOperation({
  type: 'Enter',
  execute: () => {
    /* handler logic */
  },
});
// ❌ Wrapper manages model, calls commit, places caret
```

**Good (Guarding):**

```typescript
withStructuralCommit(() => {
  // Handler manages its own flow
  modelRef.current!.updateState(...);
  commit(...);
});
// ✅ Wrapper only prevents concurrent mutations
```

---

### 3. Pattern Consistency Matters

Having different handlers use different patterns (Backspace uses `withStructuralCommit`, Enter uses `performEditorOperation`) made the architecture harder to understand and maintain.

**Result:** Unified all handlers on the same pattern → simpler, more maintainable.

---

## Conclusion

The `performEditorOperation` wrapper was built for the old singleton model architecture. After unifying on `modelRef.current`, it became incompatible and redundant.

**Solution:** Replace with direct `withStructuralCommit` + `commit()` pattern, matching all other structural handlers.

**Impact:**

- ✅ Zero crashes
- ✅ Pattern consistency
- ✅ Simpler architecture
- ✅ Compatible with unified model

**Status:** ✅ COMPLETE AND VERIFIED
