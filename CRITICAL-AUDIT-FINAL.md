# CRITICAL AUDIT REPORT — FINAL
## Complete Architecture Review After Critical Bug Discovery

**Date:** 2026-02-04  
**Trigger:** Cursor synchronization bug missed in initial audit  
**Scope:** ALL code, focus on state synchronization Model ↔ React

---

## EXECUTIVE SUMMARY

**Initial audit claimed:** "Unbreakable, 100% correct"  
**Reality:** **5 CRITICAL BUGS** in cursor/model synchronization

**Root cause:** EditorModel and React state can diverge at multiple points.

**Impact:** Enter key creates nodes at wrong positions, cursor jumps, state corruption.

---

## CRITICAL BUGS DISCOVERED

### 🔴 BUG #1: selectionchange Handler Missing Model Sync
**Location:** `NodeEditor.tsx` lines 550-573  
**Severity:** CRITICAL  
**Status:** ❌ ACTIVE BUG

**The bug:**
```typescript
// Line 553 - Cross-node navigation
setEditorState({ ...editorState, cursor: position });
// ❌ MISSING: updateModelCursor(position);

// Line 568 - Same-node update
setEditorState({ ...editorState, cursor: position });
// ❌ MISSING: updateModelCursor(position);
```

**Why it breaks:**
1. User clicks in node-10
2. `selectionchange` fires → updates React cursor to node-10
3. EditorModel cursor stays at old value (e.g., node-13)
4. User presses Enter
5. Enter handler reads: `getLiveCursor() || getModelCursor() || editorState.cursor`
6. `getModelCursor()` returns stale node-13
7. New node created after node-13 instead of node-10

**Evidence:** Debug logs show cursor node-10 in React, node-13 in model when Enter pressed.

**Fix:**
```typescript
// Add BOTH paths:
if (position.nodeId !== editorState.cursor.nodeId) {
  updateModelCursor(position); // ← ADD THIS
  setEditorState({ ...editorState, cursor: position });
  return;
}

// Same-node path:
updateModelCursor(position); // ← ADD THIS
setEditorState({ ...editorState, cursor: position });
```

---

### 🔴 BUG #2: Arrow Key Navigation Missing Model Sync
**Location:** `NodeEditor.tsx` lines 2766-2806  
**Severity:** CRITICAL  
**Status:** ❌ ACTIVE BUG

**The bug:**
```typescript
// Lines 2789-2806 (ArrowUp/ArrowDown)
const newState = e.key === 'ArrowUp' 
  ? navigateVisibleUp(editorState) 
  : navigateVisibleDown(editorState);

setEditorState(newState);
// ❌ MISSING: updateModelCursor(newState.cursor);
requestCaretPlacement();
```

**Why it breaks:**
1. User presses ArrowDown
2. React cursor moves to next node
3. EditorModel cursor NOT updated
4. Model now has stale cursor
5. Next Enter creates node at wrong position

**Impact:** Every arrow navigation leaves model stale.

**Fix:**
```typescript
const newState = e.key === 'ArrowUp' 
  ? navigateVisibleUp(editorState) 
  : navigateVisibleDown(editorState);

updateModelCursor(newState.cursor); // ← ADD THIS
setEditorState(newState);
requestCaretPlacement();
```

---

### 🔴 BUG #3: Zoom In/Out Missing Model Sync
**Location:** `NodeEditor.tsx` lines 2124-2160  
**Severity:** HIGH  
**Status:** ❌ ACTIVE BUG

**The bug:**
```typescript
// zoomIn() - line 2127
setEditorState({
  ...editorState,
  cursor: { ...editorState.cursor, offset: 0 },
});
// ❌ MISSING: updateModelCursor(cursor);

// zoomOut() - line 2152
setEditorState({
  ...editorState,
  cursor: { nodeId: focusRootId, segmentIndex: 0, offset: 0 },
});
// ❌ MISSING: updateModelCursor(cursor);
```

**Why it breaks:**
After zoom operation, cursor position changes but model not updated.

**Fix:**
```typescript
const newCursor = { ...editorState.cursor, offset: 0 };
updateModelCursor(newCursor); // ← ADD THIS
setEditorState({ ...editorState, cursor: newCursor });
```

---

### 🔴 BUG #4: Grammar Tab Autocomplete Missing Model Sync
**Location:** `NodeEditor.tsx` lines 2509-2516  
**Severity:** MEDIUM  
**Status:** ❌ ACTIVE BUG

**The bug:**
```typescript
// Grammar Tab handler - line 2509
setEditorState({
  ...editorState,
  nodes: updatedNodes,
  cursor: { ...editorState.cursor, offset: from + commandName.length + 2 },
});
// ❌ MISSING: updateModel() or updateModelCursor()
```

**Why it breaks:**
Grammar autocomplete updates React but not model.

**Fix:**
```typescript
const newCursor = { ...editorState.cursor, offset: from + commandName.length + 2 };
updateModel(updatedNodes, newCursor); // ← ADD THIS
setEditorState({ ...editorState, nodes: updatedNodes, cursor: newCursor });
```

---

### 🟡 BUG #5: Markdown Shortcuts — Inconsistent Cursor Format
**Location:** `NodeEditor.tsx` lines 2917-2983  
**Severity:** MEDIUM  
**Status:** ⚠️ PARTIAL BUG

**The issue:**
```typescript
// Lines 2917-2925 ([] task shortcut)
commit({
  nodes: updatedNodes as UINode[],
  activeNodeId: activeNode.id,  // ← Legacy format
  offset: 0,                      // ← Legacy format
  selection: { anchor: null, focus: null },
});
```

**Why it's problematic:**
- `commit()` DOES call `updateModel()` internally
- BUT: Uses legacy `activeNodeId + offset` format
- `commit()` converts to segmented format: `{ nodeId, segmentIndex: 0, offset }`
- Conversion sets `segmentIndex = 0` unconditionally (may be wrong)

**Status:** PARTIAL - model IS updated, but cursor format conversion may be lossy.

**Fix:**
```typescript
commit({
  nodes: updatedNodes as UINode[],
  cursor: { nodeId: activeNode.id, segmentIndex: 0, offset: 0 },
  selection: { anchor: null, focus: null },
});
```

---

## ARCHITECTURAL INVARIANT VIOLATION

**The core problem:** The architecture has TWO sources of truth:
1. React state (`editorState`)
2. EditorModel (`model`)

**The violated invariant:**
> "Every React state update MUST sync to EditorModel immediately"

**Where this is violated:**
- ❌ `selectionchange` handler (cursor updates)
- ❌ Arrow key navigation
- ❌ Zoom in/out
- ❌ Grammar autocomplete
- ⚠️ Markdown shortcuts (partial)

**Where this IS correct:**
- ✅ Enter key handler (lines 3090, 3120)
- ✅ Backspace handler (lines 3024, 3048)
- ✅ `commit()` function (lines 838-844)
- ✅ Debounce flush (line 783)
- ✅ Blur handler (line 696)

---

## PATTERN ANALYSIS

### ✅ CORRECT PATTERN (Enter/Backspace)
```typescript
// 1. Flush pending segments
const flushedNodes = flushPendingSegments('enter');
const liveCursor = getLiveCursor() || getModelCursor() || editorState.cursor;

// 2. Update model FIRST
updateModel(flushedNodes, liveCursor);
clearLiveCursor();

// 3. Perform operation on model
const model = getModel();
const activeNode = model.nodes.find(n => n.id === liveCursor.nodeId);
const result = handleSegmentedEnter(activeNode, liveCursor);

// 4. Update model again with result
updateModel(nodes2, result.cursor);

// 5. Sync model → React
commit({ nodes: nodes2, cursor: result.cursor });
```

**Why this is correct:**
- Model updated BEFORE read
- Operation reads from model
- Model updated with result
- React synced from model
- **No divergence possible**

### ❌ BROKEN PATTERN (selectionchange, arrows)
```typescript
// Updates React only
setEditorState({ ...editorState, cursor: newCursor });
// ❌ Model NOT updated → DIVERGENCE
```

**Why this breaks:**
- React cursor = new value
- Model cursor = stale value
- Next structural operation reads stale cursor
- Wrong behavior

---

## ENFORCEMENT GAPS

### What the audit CLAIMED:
> "Runtime invariants, ESLint rules, dev assertions ensure correctness"

### What actually exists:
- ✅ `commit()` syncs model when called
- ✅ Enter/Backspace handlers sync correctly
- ❌ **NO guard** preventing `setEditorState()` without model sync
- ❌ **NO runtime assertion** detecting model/React divergence
- ❌ **NO ESLint rule** requiring model sync after setState

**The gap:** Architecture relies on manual discipline, not enforcement.

---

## ROOT CAUSE ANALYSIS

### Why were these bugs missed?

1. **Static audit limitation:**
   - Previous audit reviewed code structure
   - Did NOT trace execution paths
   - Did NOT verify state sync at ALL update points

2. **Missing runtime guards:**
   - No assertion checking model === React state
   - No dev-mode check for divergence

3. **Incomplete pattern:**
   - `commit()` function handles sync
   - But NOT ALL state updates use `commit()`
   - Some use `setEditorState()` directly

4. **Documentation mismatch:**
   - EditorModel.ts comments say "model is source of truth"
   - But multiple code paths update React first, model never

---

## CORRECT ARCHITECTURE (ENFORCED)

### The invariant (non-negotiable):
```
React state MUST NEVER diverge from EditorModel
```

### The rule:
```
EVERY setEditorState() call MUST be paired with updateModel() or updateModelCursor()
```

### The enforcement:
```typescript
// Option A: Wrapper function
function setEditorStateAndModel(changes: {...}) {
  if (changes.cursor) {
    updateModelCursor(changes.cursor);
  }
  if (changes.nodes) {
    updateModelNodes(changes.nodes);
  }
  setEditorState(changes);
}

// Option B: Runtime guard in __DEV__
if (__DEV__) {
  const originalSetState = setEditorState;
  setEditorState = (newState) => {
    // Check if model diverged
    const model = getModel();
    if (model && newState.cursor && model.cursor !== newState.cursor) {
      throw new Error('❌ DIVERGENCE: React cursor != Model cursor');
    }
    originalSetState(newState);
  };
}
```

---

## REMEDIATION PLAN

### Phase 1: Fix all 5 bugs (IMMEDIATE)
1. Add `updateModelCursor()` to selectionchange (both paths)
2. Add `updateModelCursor()` to arrow navigation
3. Add `updateModelCursor()` to zoom in/out
4. Add `updateModel()` to grammar autocomplete
5. Convert markdown shortcuts to use cursor format

### Phase 2: Add runtime guards (HIGH PRIORITY)
1. Add `__DEV__` assertion in `setEditorState` checking model sync
2. Add periodic divergence check (every 100ms in dev)
3. Add guard preventing `setEditorState` during typing

### Phase 3: Enforce pattern (REQUIRED)
1. Create `setStateAndModel()` wrapper
2. Ban direct `setEditorState()` calls (ESLint rule)
3. Update all callsites to use wrapper

### Phase 4: Test coverage (CRITICAL)
1. Add test: "After navigation, model === React state"
2. Add test: "After selection, model === React state"
3. Add test: "After ANY state change, model === React state"

---

## TESTING GAPS

### What the tests DON'T cover:
- ❌ Cursor sync after navigation
- ❌ Cursor sync after selection
- ❌ Model/React divergence detection
- ❌ Enter key after arrow navigation
- ❌ Enter key after zoom
- ❌ Enter key after markdown shortcut

### What the tests DO cover:
- ✅ Enter splits correctly (when cursor is correct)
- ✅ Backspace merges correctly (when cursor is correct)
- ✅ Split/merge exhaustive cases (isolated)

**The gap:** Tests assume cursor is always correct. Don't test cursor correctness itself.

---

## SEVERITY ASSESSMENT

### BUG #1 (selectionchange)
- **Frequency:** Every click/selection
- **Impact:** Enter creates node at wrong position
- **User-visible:** ✅ YES - immediate, every time
- **Data loss:** ⚠️ No, but wrong structure
- **Priority:** 🔴 P0 - CRITICAL

### BUG #2 (arrow navigation)
- **Frequency:** Every arrow press
- **Impact:** Enter creates node at wrong position
- **User-visible:** ✅ YES - immediate
- **Data loss:** ⚠️ No, but wrong structure
- **Priority:** 🔴 P0 - CRITICAL

### BUG #3 (zoom)
- **Frequency:** Occasional (zoom operations)
- **Impact:** Enter creates node at wrong position after zoom
- **User-visible:** ✅ YES - when zooming
- **Data loss:** ⚠️ No, but wrong structure
- **Priority:** 🟠 P1 - HIGH

### BUG #4 (grammar autocomplete)
- **Frequency:** Rare (grammar Tab)
- **Impact:** Model stale after autocomplete
- **User-visible:** ⚠️ MAYBE - depends on next action
- **Data loss:** ⚠️ Unlikely
- **Priority:** 🟡 P2 - MEDIUM

### BUG #5 (markdown shortcuts)
- **Frequency:** Common (-, #, [])
- **Impact:** Cursor format conversion may be lossy
- **User-visible:** ⚠️ MAYBE - depends on cursor position
- **Data loss:** ⚠️ Unlikely (model IS synced)
- **Priority:** 🟡 P2 - MEDIUM

---

## HONEST ASSESSMENT

### What the initial audit got RIGHT:
1. ✅ Split/merge logic is correct (when cursor is correct)
2. ✅ Segment architecture is sound
3. ✅ Enter/Backspace handlers sync correctly
4. ✅ DOM-owned typing works (zero React renders during typing)
5. ✅ Hardening layer catches content loss

### What the initial audit MISSED:
1. ❌ Cursor synchronization at navigation points
2. ❌ Model/React divergence in non-structural paths
3. ❌ Runtime validation of model === React state
4. ❌ Test coverage of cursor correctness
5. ❌ Enforcement of sync invariant

### The truth:
> "The core engine is correct. The glue code has gaps."

---

## LESSONS LEARNED

### Why this happened:
1. **Over-confidence** after fixing backwards typing
2. **Static analysis** doesn't catch state sync bugs
3. **Missing enforcement** - relied on manual discipline
4. **Incomplete mental model** - focused on typing, ignored navigation

### How to prevent:
1. **Runtime guards** for ALL invariants
2. **Trace execution** in audit, not just read code
3. **Test state sync** explicitly, not just operations
4. **Enforce patterns** with wrappers/linters, not docs

### The principle:
> "If it's not enforced at runtime, it WILL break."

---

## CONCLUSION

**Status:** Architecture is fundamentally sound, but has 5 critical gaps in state synchronization.

**Severity:** P0 - User-visible bugs in navigation + Enter key flow.

**Root cause:** Missing model sync in non-structural update paths.

**Fix complexity:** LOW - add 5-10 lines of code per bug.

**Risk if unfixed:** HIGH - Enter key creates nodes at wrong positions, state corruption, user confusion.

**Recommendation:** Fix ALL 5 bugs immediately, add runtime guards, enforce pattern.

---

## APPENDIX A: ALL STATE UPDATE POINTS

### ✅ CORRECT (model synced)
1. `commit()` function (line 838)
2. Enter handler (lines 3090, 3120)
3. Backspace handler (lines 3024, 3048)
4. Debounce flush (line 783)
5. Blur handler (line 696)

### ❌ BROKEN (model NOT synced)
1. selectionchange handler (lines 553, 568)
2. Arrow navigation (line 2789, 2804)
3. Zoom in (line 2127)
4. Zoom out (line 2152)
5. Grammar Tab autocomplete (line 2509)

### ⚠️ PARTIAL (synced but via legacy format)
1. Markdown shortcuts (lines 2917-2983)

**Total:** 6 correct, 5 broken, 1 partial  
**Ratio:** 50% compliance  
**Assessment:** ❌ FAILS "unbreakable" claim

---

## APPENDIX B: FIX CHECKLIST

- [ ] BUG #1: Add `updateModelCursor()` to selectionchange (both paths)
- [ ] BUG #2: Add `updateModelCursor()` to arrow navigation (both directions)
- [ ] BUG #3: Add `updateModelCursor()` to `zoomIn()`
- [ ] BUG #4: Add `updateModelCursor()` to `zoomOut()`
- [ ] BUG #5: Add `updateModel()` to grammar Tab autocomplete
- [ ] BUG #6: Convert markdown shortcuts to use cursor format
- [ ] Add runtime guard detecting divergence
- [ ] Add test: model === React after navigation
- [ ] Add test: model === React after selection
- [ ] Add test: Enter after arrow navigation
- [ ] Add test: Enter after zoom
- [ ] Document sync invariant in EditorModel.ts
- [ ] Create `setStateAndModel()` wrapper
- [ ] Ban direct `setEditorState()` calls (ESLint)

**Completion:** 0/14 ❌

---

**Report compiled:** 2026-02-04  
**By:** AI Audit System  
**Next audit:** After all fixes applied + runtime guards added
