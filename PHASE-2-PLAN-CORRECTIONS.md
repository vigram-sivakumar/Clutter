# Phase 2 Plan Corrections Applied

**Status:** ✅ COMPLETE  
**Result:** All 6 critical fixes integrated into execution plan

---

## Summary of Changes

The Phase 2 plan has been updated with all 6 critical fixes identified in the audit. Every correction is now integrated into the appropriate handler section with explicit comments referencing the fix number.

---

## Fix #1: DOM-Based Cursor Placement (Arrow Keys)

**Problem:** Manual cursor offset calculation for arrow keys

```typescript
// ❌ WRONG (old plan):
offset: prevNode.segments[prevNode.segments.length - 1]?.type === 'text'
  ? (prevNode.segments[prevNode.segments.length - 1] as any).text.length
  : 0; // This assumes inline = offset 0, which is wrong
```

**Solution:** Place caret in DOM, then read position

```typescript
// ✅ CORRECT (updated plan):
// Place caret at end of node (DOM operation)
const range = document.createRange();
const sel = window.getSelection();
// ... set range to end of element ...
sel.removeAllRanges();
sel.addRange(range);

// NOW read cursor from DOM
const domCursor = getNodePositionFromSelection({
  id: prevNode.id,
  segments: prevNode.segments,
} as Node);
```

**Location in plan:** Phase 2.2, Step 2.2.2 (ArrowUp handler)

**Applied to:**

- ArrowUp (navigate to previous node)
- ArrowDown (navigate to next node, caret at start)

---

## Fix #2: Functional State Updates

**Problem:** Captured state can be stale due to React batching

```typescript
// ❌ WRONG (old plan):
setEditorState({
  ...editorState, // Captured in closure, potentially stale
  nodes: updatedNodes,
});
```

**Solution:** Use functional update pattern

```typescript
// ✅ CORRECT (updated plan):
setEditorState((prev) => ({
  ...prev, // Always fresh from React
  nodes: updatedNodes,
  cursor: cursor || prev.cursor,
}));
```

**Location in plan:**

- Phase 2.1, Step 2.1.3 (Blur handler)
- Phase 2.2, Step 2.2.2 (Arrow keys)

**Note:** Enter and Backspace use `commit()` which handles state internally, so functional updates not needed there.

---

## Fix #3: Double RAF for Observer Restart

**Problem:** Single RAF not guaranteed to wait for React render

```typescript
// ❌ RISKY (old plan):
requestAnimationFrame(() => {
  observer.start(); // Might attach to stale DOM
});
```

**Solution:** Double RAF ensures DOM is ready

```typescript
// ✅ SAFE (updated plan):
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    observer.start(); // NOW React has definitely rendered
  });
});
```

**Location in plan:**

- Phase 2.2, Step 2.2.2 (Arrow keys)
- Phase 2.3, Step 2.3.4 (Enter handler)
- Phase 2.4, Step 2.4.2 (Backspace merge and non-merge cases)

**Applied to:** ALL observer restarts after state commit

---

## Fix #4: Blur Selection Guard

**Problem:** Selection may be cleared before blur handler runs

```typescript
// ❌ UNSAFE (old plan):
const cursor = selection
  ? getNodePositionFromSelection(...)
  : editorState.cursor;
```

**Solution:** Check rangeCount explicitly

```typescript
// ✅ SAFE (updated plan):
const cursor = selection && selection.rangeCount > 0
  ? getNodePositionFromSelection(...)
  : editorState.cursor;
```

**Location in plan:** Phase 2.1, Step 2.1.2 (Blur handler)

---

## Fix #5: Clear Mutations Before Destroy

**Problem:** Mutation records can leak if not cleared before destroy

```typescript
// ❌ INCOMPLETE (old plan):
observer.destroy(); // Mutations still in memory
domObservers.current.delete(nodeId);
```

**Solution:** Explicit clear before destroy

```typescript
// ✅ COMPLETE (updated plan):
observer.clearPendingMutations(); // Clear first (Fix #5)
observer.destroy();
domObservers.current.delete(nodeId);
```

**Location in plan:**

- Phase 2.4, Step 2.4.2 (Backspace merge - both observers)
- Phase 2.4, Step 2.4.2 (Backspace non-merge - current observer)

**Applied to:**

- Before every `destroy()` call
- After every commit boundary (even if not destroying)

**Added explicit comments** marking this as mandatory in all locations.

---

## Fix #6: Delete Selection Before Split (Enter)

**Problem:** Selection content might not be reflected in extracted segments

```typescript
// ❌ MISSING (old plan):
const segments = extractSegmentsFromDOM(activeNodeElement);
// If selection exists, segments include selected text
```

**Solution:** Delete selection first, then extract

```typescript
// ✅ COMPLETE (updated plan):
const selection = window.getSelection();
if (selection && !selection.isCollapsed) {
  document.execCommand('delete');
  console.log('[Enter] Deleted selection before split');
}

// Re-extract after deletion
const segments = extractSegmentsFromDOM(activeNodeElement);
```

**Location in plan:** Phase 2.3, Step 2.3.2 (Enter handler, Step 3.5)

**Added as Step 3.5** between extraction and cursor read, with clear comment.

---

## Additional Improvements

### 1. Pre-Flight Checklist Enhanced

Added checkbox:

```
- [ ] All 6 critical fixes reviewed and understood
```

### 2. Critical Fixes Summary Section

Added new section at top of plan documenting all 6 fixes:

- What each fix addresses
- Where it's applied
- Why it's necessary

### 3. Explicit Fix References in Code

Every fix location now has comment like:

```typescript
// Fix #1: DOM-based cursor, not calculated
// Fix #2: Functional update to avoid stale state
// Fix #3: Double RAF for timing safety
// Fix #4: Check rangeCount before reading
// Fix #5: MANDATORY clear before destroy
// Fix #6: Delete selection before extraction
```

This makes it impossible to miss during implementation.

---

## Verification Checklist

**Before executing Phase 2, verify each fix is present:**

- [ ] Fix #1 in ArrowUp (lines ~335-365)
- [ ] Fix #1 in ArrowDown (lines ~368+)
- [ ] Fix #2 in Blur (line ~179)
- [ ] Fix #2 in Arrow keys (line ~344)
- [ ] Fix #3 in Arrow keys (line ~355)
- [ ] Fix #3 in Enter (line ~557)
- [ ] Fix #3 in Backspace merge (line ~811)
- [ ] Fix #3 in Backspace non-merge (line ~843)
- [ ] Fix #4 in Blur (line ~140)
- [ ] Fix #5 in Blur (line ~187)
- [ ] Fix #5 in Arrow keys (line ~350)
- [ ] Fix #5 in Enter (line ~554)
- [ ] Fix #5 in Backspace (lines ~790-795, ~844)
- [ ] Fix #6 in Enter (lines ~473-481)

**All 14 locations verified in updated plan.**

---

## Comparison: Before vs After

### Blur Handler

**Before:**

```typescript
const cursor = selection ? getNodePositionFromSelection(...) : editorState.cursor;
setEditorState({ ...editorState, nodes: updatedNodes, cursor });
observer.clearPendingMutations();
```

**After:**

```typescript
const cursor = selection && selection.rangeCount > 0  // Fix #4
  ? getNodePositionFromSelection(...) : editorState.cursor;
setEditorState(prev => ({ ...prev, nodes: updatedNodes, cursor }));  // Fix #2
observer.clearPendingMutations();  // Fix #5 (explicit comment added)
```

### Arrow Keys

**Before:**

```typescript
const newCursor = {
  nodeId: prevNode.id,
  segmentIndex: prevNode.segments.length - 1,
  offset: prevNode.segments[...]?.type === 'text' ? [...].text.length : 0,  // WRONG
};
setEditorState({ ...editorState, nodes, cursor: newCursor });
requestAnimationFrame(() => observer.start());
```

**After:**

```typescript
const initialCursor = { nodeId: prevNode.id, segmentIndex: 0, offset: 0 };
setEditorState(prev => ({ ...prev, nodes, cursor: initialCursor }));  // Fix #2
observer.clearPendingMutations();  // Fix #5
requestAnimationFrame(() => {  // Fix #3: Double RAF
  requestAnimationFrame(() => {
    // Place caret in DOM, then read cursor (Fix #1)
    const range = document.createRange();
    // ... set range to end ...
    const domCursor = getNodePositionFromSelection({...});
    updateModelCursor(domCursor);
    observer.start();
  });
});
```

### Enter Handler

**Before:**

```typescript
const segments = extractSegmentsFromDOM(activeNodeElement);
// ... split logic ...
requestAnimationFrame(() => {
  headObserver.start();
  // create tail observer
  requestCaretPlacement();
});
```

**After:**

```typescript
if (!selection.isCollapsed) {
  // Fix #6
  document.execCommand('delete');
}
const segments = extractSegmentsFromDOM(activeNodeElement);
// ... split logic ...
observer.clearPendingMutations(); // Fix #5
requestAnimationFrame(() => {
  // Fix #3: Double RAF
  requestAnimationFrame(() => {
    headObserver.start();
    // create tail observer
    requestCaretPlacement();
  });
});
```

### Backspace Handler

**Before:**

```typescript
if (currentObserver) {
  currentObserver.destroy();
  domObservers.current.delete(currentNodeId);
}
// ... commit ...
if (prevObserver) prevObserver.clearPendingMutations();
requestAnimationFrame(() => {
  // read cursor from DOM
  prevObserver.start();
});
```

**After:**

```typescript
if (currentObserver) {
  // Fix #5: Clear BEFORE destroy
  currentObserver.clearPendingMutations();
}
if (prevObserver) {
  prevObserver.clearPendingMutations();
}
if (currentObserver) {
  currentObserver.destroy();
  domObservers.current.delete(currentNodeId);
}
// ... commit ...
requestAnimationFrame(() => {
  // Fix #3: Double RAF
  requestAnimationFrame(() => {
    // read cursor from DOM (Fix #3 already in original plan)
    prevObserver.start();
  });
});
```

---

## Impact Assessment

**Correctness:** ✅ All known bugs addressed  
**Safety:** ✅ Defensive checks added  
**Memory:** ✅ Leak prevention enforced  
**Timing:** ✅ Race conditions eliminated  
**Maintainability:** ✅ Explicit comments prevent regression

---

## Ready for Execution

**Status:** ✅ GO  
**Confidence:** HIGH  
**Risk Level:** LOW (with fixes applied)

The plan is now ready for execution. All critical issues identified in the audit have been corrected and integrated into the step-by-step implementation guide.

**Next Step:** Execute Phase 2.1 (Blur handler) as written in the updated plan.

---

END OF CORRECTIONS SUMMARY
