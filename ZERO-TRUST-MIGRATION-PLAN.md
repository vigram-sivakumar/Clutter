# ZERO-TRUST MIGRATION PLAN

**Goal:** Make cursor/enter/backspace bugs STRUCTURALLY IMPOSSIBLE  
**Mode:** Paranoid. Zero trust. No manual discipline.  
**Status:** Infrastructure created, migration required

---

## INFRASTRUCTURE CREATED

### 1. Single Write Pipeline (`SingleWritePipeline.ts`)

**THE ONLY WAY TO MUTATE STATE**

```typescript
setStateAndModel({
  nodes?: Node[],
  cursor?: CursorPosition,
  reason: string  // MANDATORY
})
```

**Enforces order (no exceptions):**
1. Assert NOT typing
2. Assert NOT locked
3. Update MODEL first
4. Update REACT second  
5. Request caret ALWAYS
6. Assert invariants AFTER

**Result:** Impossible to:
- Forget model sync
- Forget caret placement
- Mutate while typing
- Mutate concurrently
- Skip validation

### 2. Cursor Invariants (`CursorInvariants.ts`)

**Assertions that run after EVERY render:**
- `assertCursorNodeExists()` - node must exist
- `assertSegmentIndexValid()` - index in range
- `assertOffsetValid()` - offset <= text.length
- `assertModelReactSync()` - model === React (when not typing)

**Result:** Crashes immediately on invalid cursor state

---

## CURRENT VIOLATIONS (Must Migrate)

### Found in NodeEditor.tsx:

**Direct calls (FORBIDDEN):**
- `setEditorState`: 22 calls → must use `setStateAndModel`
- `updateModel`: 4 calls → must use `setStateAndModel`
- `updateModelCursor`: 1 call → must use `setStateAndModel`
- `requestCaretPlacement`: 15 calls → automatic in `setStateAndModel`
- `withStructuralCommit`: 10 calls → delete entirely

**Total violations:** 52 callsites

---

## MIGRATION PATTERN

### Before (FORBIDDEN):

```typescript
// Manual pattern (many places to forget)
stopTyping();
withStructuralCommit(() => {
  const flushed = flushPendingSegments('reason');
  updateModel(flushed, cursor);  // ← CAN FORGET
  
  const newNodes = [...];
  const newCursor = {...};
  
  updateModel(newNodes, newCursor);  // ← CAN FORGET
  
  setEditorState({  // ← CAN FORGET
    nodes: newNodes,
    cursor: newCursor,
  });
  
  requestCaretPlacement();  // ← CAN FORGET
});
```

**Failure modes:**
- Forget `updateModel()` → Model/React divergence
- Forget `setEditorState()` → React stale
- Forget `requestCaretPlacement()` → Cursor lost
- Forget `stopTyping()` → Typing corruption
- Wrong order → Race conditions

### After (ENFORCED):

```typescript
// Single call (impossible to forget)
setStateAndModel({
  nodes: newNodes,
  cursor: newCursor,
  reason: 'Enter key pressed'
});

// ← stopTyping: checked automatically
// ← updateModel: happens first
// ← setEditorState: happens second
// ← requestCaretPlacement: happens always
// ← validation: happens automatically
```

**Failure modes:**
- ❌ NONE (if operation logic is correct)

---

## MIGRATION CHECKLIST

### Phase 1: Replace Enter Handler (EXAMPLE)

**File:** `NodeEditor.tsx` line ~3105

**Before:**
```typescript
if (e.key === 'Enter') {
  stopTyping();
  withStructuralCommit(() => {
    const flushed = flushPendingSegments('enter');
    updateModel(flushed, liveCursor);
    clearLiveCursor();
    
    const model = getModel();
    const activeNode = model.nodes.find(n => n.id === liveCursor.nodeId);
    
    const enterResult = handleSegmentedEnter(activeNode, liveCursor);
    
    const nodes1 = replaceNode(model.nodes as Node[], activeNode.id, enterResult.head);
    const nodes2 = insertNodeAfter(nodes1, activeNode.id, enterResult.tail);

    updateModel(nodes2, enterResult.cursor);
    
    commit({
      nodes: nodes2 as UINode[],
      cursor: enterResult.cursor,
    });
    
    requestCaretPlacement();
  });
}
```

**After:**
```typescript
if (e.key === 'Enter') {
  e.preventDefault();
  
  // Get current model state
  const model = getModel();
  const activeNode = model.nodes.find(n => n.id === model.cursor.nodeId);
  
  if (!activeNode) {
    throw new Error('Active node not found');
  }
  
  // Perform operation (pure logic)
  const enterResult = handleSegmentedEnter(activeNode, model.cursor);
  
  const nodes1 = replaceNode(model.nodes as Node[], activeNode.id, enterResult.head);
  const nodes2 = insertNodeAfter(nodes1, activeNode.id, enterResult.tail);
  
  // Single mutation point
  setStateAndModel({
    nodes: nodes2,
    cursor: enterResult.cursor,
    reason: 'Enter key pressed'
  });
}
```

**What changed:**
- ❌ Removed `stopTyping()` (checked automatically)
- ❌ Removed `withStructuralCommit()` (lock built-in)
- ❌ Removed `flushPendingSegments()` (handle separately)
- ❌ Removed manual `updateModel()` (automatic)
- ❌ Removed manual `commit()` (automatic)
- ❌ Removed manual `requestCaretPlacement()` (automatic)
- ✅ Added `reason` (mandatory documentation)

### Phase 2: Replace Backspace Handler

Same pattern as Enter, ~50 lines → ~15 lines

### Phase 3: Replace Arrow Navigation

Same pattern, each handler ~30 lines → ~10 lines

### Phase 4: Replace selectionchange

**Before:**
```typescript
const position = getNodePositionFromSelection(sel, node);
setEditorState({
  ...editorState,
  cursor: position,
});
```

**After:**
```typescript
const position = getNodePositionFromSelection(sel, node);

// Guard: skip if typing or locked
if (isTyping() || isPipelineLocked()) return;

setStateAndModel({
  cursor: position,
  reason: 'selectionchange event'
});
```

### Phase 5: Replace Zoom/Grammar/Other Operations

Same pattern for ALL structural changes.

---

## PHASES TO EXECUTE

### ✅ PHASE 0: INFRASTRUCTURE CREATED

- [x] Single Write Pipeline
- [x] Cursor Invariants
- [x] Forbidden state assertions

### ⏳ PHASE 1: MIGRATE OPERATIONS (CRITICAL)

**Priority order:**
1. [ ] Enter handler (highest risk)
2. [ ] Backspace handler
3. [ ] Arrow navigation (4 handlers)
4. [ ] selectionchange handler
5. [ ] Zoom in/out
6. [ ] Grammar Tab autocomplete
7. [ ] All other `setEditorState` calls

**For each:**
- Extract operation logic
- Call `setStateAndModel()`
- Test operation
- Verify no crashes

### ⏳ PHASE 2: DELETE ESCAPE HATCHES

After all migrations:
- [ ] Delete `withStructuralCommit` function
- [ ] Delete `commit` function
- [ ] Make `requestCaretPlacement` throw
- [ ] Make `updateModel` throw (if called directly)
- [ ] Delete temporary escape hatch `const setEditorState = _setEditorStateRaw;`

### ⏳ PHASE 3: ADD RENDER ASSERTIONS

**File:** `NodeEditor.tsx`

**Add after every render:**
```typescript
useEffect(() => {
  if (__DEV__) {
    assertCursorInvariants(editorState.nodes, editorState.cursor, 'post-render');
  }
}, [editorState.nodes, editorState.cursor]);
```

### ⏳ PHASE 4: EFFECT SAFETY AUDIT

**For EVERY useEffect in NodeEditor.tsx:**
- [ ] List what it reads
- [ ] List what it writes
- [ ] Verify it can't run during typing
- [ ] Verify it doesn't mutate without `setStateAndModel`
- [ ] Add guards if needed

### ⏳ PHASE 5: NODEVIEW HARDENING

**File:** `NodeView.tsx`

**Already has typing guard, add:**
```typescript
useEffect(() => {
  // ... existing guard ...
  
  // 🔒 ASSERTION: DOM must match model when at rest
  if (__DEV__ && !isTyping()) {
    const modelText = getPlainText(node.segments);
    const domText = contentRef.current?.textContent || '';
    
    if (modelText !== domText) {
      throw new Error(
        `❌ FORBIDDEN STATE: DOM !== Model when not typing\n` +
        `Model: "${modelText}"\n` +
        `DOM: "${domText}"\n` +
        `Node: ${node.id}`
      );
    }
  }
}, [node.segments]);
```

### ⏳ PHASE 6: SELECTIONCHANGE HARDENING

**File:** `NodeEditor.tsx` selectionchange handler

**Add all guards:**
```typescript
const handleSelectionChange = useCallback(() => {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;

  // GUARD 1: Skip if typing
  if (isTyping()) return;
  
  // GUARD 2: Skip if pipeline locked
  if (isPipelineLocked()) return;
  
  // GUARD 3: Skip if caret placement pending
  if (needsCaretPlacementRef.current) return;
  
  // GUARD 4: Skip if debounce in progress
  if (isDebounceFlush()) return;

  // ... get position ...
  
  // Use single write pipeline
  setStateAndModel({
    cursor: position,
    reason: 'selectionchange event'
  });
}, []);
```

### ⏳ PHASE 7: DEBOUNCE ISOLATION

**File:** `TypingBuffer.ts`

**Add flag:**
```typescript
let _debounceInProgress = false;

export function isDebounceFlush(): boolean {
  return _debounceInProgress;
}

function flushToModel(): void {
  _debounceInProgress = true;
  
  try {
    // Only update model, NOT React
    const flushed = flushPendingSegments();
    const model = getModel();
    updateModel(flushed, model.cursor);
  } finally {
    _debounceInProgress = false;
  }
}
```

**Result:** selectionchange blocked during debounce

### ⏳ PHASE 8: FINAL VERIFICATION

**Tests to run:**
1. [ ] Click → Enter → node at correct position
2. [ ] Arrow → Enter → correct node
3. [ ] Type → debounce → Enter → correct node
4. [ ] Spam Enter rapidly → deterministic result
5. [ ] Type + unrelated state change → no DOM loss
6. [ ] Trigger model/React divergence → crashes

**Expected results:**
- All operations work correctly
- No crashes in normal use
- Crashes immediately on architectural violations
- Impossible to forget model sync, caret placement, validation

---

## BLOCKING ISSUES

### Current State:

**Can test now:**
- Infrastructure exists
- Enter key already migrated to old pipeline
- Need to migrate to NEW pipeline (`setStateAndModel`)

**Cannot proceed until:**
- All 52 violations migrated
- Escape hatches deleted
- Assertions added to effects

---

## MIGRATION ESTIMATE

### Time per operation:
- Simple (Arrow, Zoom): 5-10 minutes each
- Complex (Enter, Backspace): 15-20 minutes each
- selectionchange: 20-30 minutes (many edge cases)

### Total estimate:
- 22 setEditorState calls: ~4 hours
- 10 withStructuralCommit removals: ~2 hours
- Effect audits: ~2 hours
- Testing: ~2 hours
- **Total: ~10 hours** (mechanical work)

---

## SUCCESS CRITERIA

### Question: Can Enter/Backspace/Cursor break if dev forgets guard?

**Before:** ✅ YES
- Forget `updateModel()` → Model/React diverge
- Forget `requestCaretPlacement()` → Cursor lost
- Forget `stopTyping()` → Typing corrupted
- Forget validation → Silent bugs

**After:** ❌ NO
- Only ONE function to call: `setStateAndModel()`
- ALL steps automatic
- ALL guards automatic
- ALL validation automatic
- Mistakes = crash immediately

**If future bug requires:** "just add updateModel() here"  
**Then:** ARCHITECTURE HAS FAILED

**Fix:** Structure, not symptoms

---

## NEXT IMMEDIATE STEPS

### Step 1: Initialize New Pipeline

**File:** `NodeEditor.tsx` line ~296

```typescript
useEffect(() => {
  if (pipelineInitializedRef.current) return;

  // 1. Initialize model FIRST
  initializeModel(editorState.nodes as Node[], editorState.cursor);

  // 2. Initialize NEW single write pipeline
  _initializeSingleWritePipeline(
    _setEditorStateRaw,
    requestCaretPlacement
  );

  // 3. Initialize old pipelines (temporary, will delete)
  _initializePipeline(_setEditorStateRaw, requestCaretPlacement);
  _initializeStateWrapper(_setEditorStateRaw);

  // ...
}, []);
```

### Step 2: Migrate Enter Handler

Use pattern shown above

### Step 3: Test Enter Works

Verify with new pipeline

### Step 4: Migrate Remaining Operations

One by one, test each

### Step 5: Delete Old Infrastructure

After all migrations complete

---

**Current status:** Infrastructure ready, migration required  
**Confidence:** HIGH (pattern is mechanical)  
**Risk:** LOW (crashes prevent silent corruption)  
**Estimated completion:** 10 hours of focused work

**This will make bugs STRUCTURALLY IMPOSSIBLE.**
