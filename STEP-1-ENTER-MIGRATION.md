# STEP 1: MIGRATE ENTER KEY HANDLER — Proof of Enforcement

**Goal:** Migrate one operation to PROVE enforcement works  
**Target:** Enter key (most critical operation)  
**Success criteria:** Enter works, violations crash, cannot forget steps

---

## CURRENT ENTER HANDLER (Lines 3073-3131)

**Manual pattern (50+ lines):**
```typescript
if (e.key === 'Enter') {
  // preventDefault already called at top
  // Grammar mode already handled

  // 🔒 FLUSH BOUNDARY: Stop typing flag FIRST
  stopTyping(); // ← CAN FORGET
  
  // 🔒 PHASE C: Structural operation - flush model → React
  withStructuralCommit(() => {
    // First: Sync pending segments to model
    const flushedNodes = flushPendingSegments('enter'); // ← CAN FORGET
    const liveCursor = getLiveCursor() || getModelCursor() || editorState.cursor;
    
    updateModel(flushedNodes, liveCursor); // ← CAN FORGET
    clearLiveCursor(); // ← CAN FORGET
    
    // Now: Read from model
    const model = getModel();
    const activeNode = model.nodes.find(n => n.id === liveCursor.nodeId);
    
    if (!activeNode) return;

    // Use segmented editor API
    const enterResult = handleSegmentedEnter(activeNode, liveCursor);
    
    const nodes1 = replaceNode(model.nodes as Node[], activeNode.id, enterResult.head);
    const nodes2 = insertNodeAfter(nodes1, activeNode.id, enterResult.tail);

    // Update model first
    updateModel(nodes2, enterResult.cursor); // ← CAN FORGET
    
    // Then: Sync model → React
    commit({
      nodes: nodes2 as UINode[],
      cursor: enterResult.cursor,
    });
    
    requestCaretPlacement(); // ← CAN FORGET
  });
  return;
}
```

**Failure modes:**
- Forget `stopTyping()` → typing continues, bugs
- Forget `flushPendingSegments()` → stale data
- Forget `updateModel()` → Model/React divergence
- Forget `requestCaretPlacement()` → cursor lost
- Forget lock → concurrent ops

---

## MIGRATED ENTER HANDLER (15 lines)

**Enforced pattern:**
```typescript
if (e.key === 'Enter') {
  e.preventDefault();
  
  performEditorOperation({
    type: 'Enter',
    execute: (nodes, cursor) => {
      // Find active node (guaranteed to exist by assertions)
      const activeNode = nodes.find(n => n.id === cursor.nodeId);
      if (!activeNode) {
        throw new Error('INVARIANT VIOLATION: Active node not found');
      }
      
      // Split node
      const enterResult = handleSegmentedEnter(activeNode, cursor);
      
      // Build new node array
      const nodes1 = replaceNode(nodes, activeNode.id, enterResult.head);
      const nodes2 = insertNodeAfter(nodes1, activeNode.id, enterResult.tail);
      
      // Return new state (pipeline handles rest)
      return { 
        nodes: nodes2, 
        cursor: enterResult.cursor 
      };
    }
  });
  return;
}
```

**Automatic (cannot forget):**
- ✅ `stopTyping()` - pipeline does it (line 122 in CommitPipeline)
- ✅ Lock - pipeline does it (line 118)
- ✅ Flush - pipeline does it (line 126-128)
- ✅ `updateModel()` - pipeline does it (line 137)
- ✅ Validate - pipeline does it (line 140)
- ✅ Caret placement - pipeline does it (line 153)
- ✅ Unlock - pipeline does it (line 168)

**Failure modes:**
- ❌ NONE (if operation logic correct)
- Invalid state → assertions crash immediately
- Cannot forget steps → pipeline enforces
- Cannot skip placement → automatic
- Cannot run concurrently → lock prevents

---

## MIGRATION CHANGES (Exact)

### File: `NodeEditor.tsx`

**Location:** Line ~3073  
**Remove:** Lines 3073-3131 (59 lines)  
**Add:** Lines shown above (18 lines)  
**Net:** -41 lines

### Required imports (already added):
```typescript
import {
  performEditorOperation,
  type EditorOperation,
} from './enforcement';
```

### Required functions (already imported):
```typescript
import { handleSegmentedEnter } from './editor';
import { replaceNode, insertNodeAfter } from './engine/NodeKernel';
```

---

## VERIFICATION AFTER MIGRATION

### Test 1: Enter works normally
1. Load editor
2. Click in a node
3. Press Enter
4. **Expected:** New node created, cursor placed correctly

### Test 2: Enforcement catches bugs
1. Modify execute function to return invalid cursor
2. Press Enter
3. **Expected:** Crash with "FORBIDDEN STATE: Cursor node not found"

### Test 3: Cannot forget steps
1. Remove `stopTyping()` from pipeline (simulate forgetting)
2. Press Enter while typing
3. **Expected:** Crash or wrong behavior (caught by assertions)
4. Restore `stopTyping()` to pipeline
5. **Expected:** Works correctly

### Test 4: Console logs show pipeline
1. Press Enter
2. Check console
3. **Expected:**
```
🔒 Pipeline LOCKED for: Enter
📚 EditorModel: Model updated
✅ State updated [Enter]
📍 Caret placement scheduled
✅ Caret placed
🔓 Pipeline UNLOCKED
```

### Test 5: Caret automatic
1. Press Enter
2. Do NOT see any `requestCaretPlacement()` call in code
3. **Expected:** Caret still placed correctly (automatic)

---

## AFTER THIS MIGRATION

**Can Enter break if dev forgets guard?**
**Answer:** ❌ NO

**Why:**
- Pipeline enforces all steps automatically
- Cannot skip flush (pipeline does it)
- Cannot skip model update (pipeline does it)
- Cannot skip validation (pipeline does it)
- Cannot skip caret (pipeline does it)
- Cannot run concurrently (lock prevents)

**If logic is wrong:**
- Assertions crash immediately
- Stack trace shows exact violation
- Cannot fail silently

---

## REMAINING MIGRATIONS (After Enter Proven)

1. Backspace handler (~50 lines → ~15 lines)
2. Arrow navigation (~40 lines → ~10 lines)
3. selectionchange (~100 lines → 3 lines: `captureSelectionIntent()`)
4. Zoom in/out (~30 lines → ~10 lines each)
5. Grammar Tab (~20 lines → ~10 lines)

**Each follows same pattern:**
- Extract operation logic
- Wrap in `performEditorOperation()`
- Delete manual pipeline steps
- Verify enforcement catches violations

---

**Next action:** Apply this exact migration to NodeEditor.tsx line 3073
