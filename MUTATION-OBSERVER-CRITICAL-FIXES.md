# MUTATION OBSERVER REFACTOR - CRITICAL FIXES

## MANDATORY - DO NOT SKIP

These 6 fixes address critical correctness gaps identified in audit.
Each MUST be incorporated before starting Phase 1.

**Failure to implement these will cause bugs in 2-4 weeks.**

---

## FIX #1: Explicit Selection Invariant

### Problem
MutationObserver does NOT capture:
- Selection changes
- Caret movement
- Some IME internal mutations (Safari)
- `beforeinput` intent

We implicitly handle this correctly, but it's not documented as an invariant.
Future engineer may try to "optimize" by deriving cursor from mutations.

### Fix: Add Explicit Invariant

**Where:** Add to both code and documentation

**In `DOMObserver.ts` header comment:**

```typescript
/**
 * DOMObserver - Tracks DOM content mutations
 * 
 * CRITICAL INVARIANTS:
 * 
 * 1. MutationObserver tracks CONTENT mutations only
 *    - Text changes
 *    - Element insertions/removals
 *    - Attribute changes
 * 
 * 2. MutationObserver does NOT track:
 *    - Selection/cursor changes
 *    - Caret movement
 *    - Some IME composition states (Safari)
 * 
 * 3. Cursor position MUST be read synchronously from window.getSelection()
 *    at commit boundaries. NEVER infer cursor from mutations.
 * 
 * 4. Pending mutations are for diagnostics only.
 *    They MUST NOT be used to infer editor state.
 */
```

**In `EDITOR-ARCHITECTURE.md`:**

```markdown
## Core Invariants

### Invariant 1: Selection is Authoritative

**Rule:** Cursor/selection is always read directly from `window.getSelection()` 
at commit boundaries. Never inferred from MutationObserver data.

**Why:** MutationObserver does not reliably track selection changes, especially:
- Caret-only movement (no content change)
- Selection expansion/collapse
- IME composition states (Safari)
- beforeinput intent signals

**Enforcement:** Any commit boundary that doesn't read fresh selection 
from DOM is a bug.
```

**Verification:**
- [ ] Comment added to `DOMObserver.ts`
- [ ] Invariant documented in `EDITOR-ARCHITECTURE.md`
- [ ] All commit boundaries explicitly call `window.getSelection()`
- [ ] No code branches on mutation observer for cursor position

---

## FIX #2: Observer Batching Is Non-Authoritative

### Problem
Current code collects `pendingMutations` but never defines:
- When they're used
- What they're for
- Why they exist

Risk: Future dev uses them for state inference, reintroducing partial-state logic.

### Fix: Explicit Intent + Enforcement

**In `DOMObserver.ts`:**

```typescript
export class DOMObserver {
  private observer: MutationObserver;
  private element: HTMLElement;
  private isObserving = false;
  
  /**
   * Pending mutations - FOR DIAGNOSTICS ONLY
   * 
   * CRITICAL: These MUST NOT be used to infer editor state.
   * 
   * Purpose:
   * - Debugging (log what changed)
   * - Performance monitoring (mutation count)
   * - Test assertions (verify mutations fired)
   * 
   * NOT for:
   * - Computing deltas
   * - Deriving cursor position
   * - Incremental state updates
   * 
   * All authoritative state is extracted from DOM at commit boundaries.
   */
  private pendingMutations: MutationRecord[] = [];
  
  // ... rest of class
  
  /**
   * Get pending mutations for diagnostics
   * 
   * WARNING: Do not use these for state computation.
   * This is for logging/debugging only.
   */
  getPendingMutations(): MutationRecord[] {
    return [...this.pendingMutations];
  }
  
  /**
   * Clear pending mutations
   * 
   * MUST be called after every commit boundary to prevent stale data.
   */
  clearPendingMutations() {
    this.pendingMutations = [];
  }
}
```

**Add to commit boundary template:**

Every commit boundary MUST:
```typescript
// After model update, before restarting observer:
observer.clearPendingMutations(); // Prevent stale diagnostic data
```

**Verification:**
- [ ] Warning comment added to `pendingMutations`
- [ ] JSDoc warnings on getter methods
- [ ] `clearPendingMutations()` called after every commit
- [ ] No logic branches on mutation contents (search codebase)

---

## FIX #3: Cursor Offset for Inline Segments

### Problem
**MOST DANGEROUS BUG IN PLAN**

Current Backspace merge code:

```typescript
const cursorOffset = prevSegments.reduce((sum, seg) =>
  sum + (seg.type === 'text' ? seg.text.length : 1), 0
);
```

**This is wrong because:**
- Inline segments are NOT length 1
- They don't map linearly to DOM offsets
- They may render as:
  - Zero-width spans
  - Atomic elements
  - `contenteditable=false` nodes

**Consequence:**
- Cursor lands in wrong position after merge
- Subsequent typing inserts at wrong place
- Splits after merge are incorrect

### Fix: Derive Cursor from DOM or Use Segment-Aware Math

**Option A: Read from DOM (RECOMMENDED)**

```typescript
// AFTER merge, BEFORE cursor set:
function getCursorOffsetAfterMerge(
  mergedElement: HTMLElement,
  segmentsBeforeMerge: Segment[]
): { segmentIndex: number; offset: number } {
  // Let DOM render, then read actual cursor position
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    // Fallback: start of merged content
    return { segmentIndex: 0, offset: 0 };
  }
  
  // Map DOM selection to segment position
  return mapDOMSelectionToCursor(selection, mergedElement);
}
```

**Option B: Segment-Aware Math (if you have utility)**

```typescript
function computeCursorAfterMerge(
  prevSegments: Segment[],
  currentSegments: Segment[]
): { segmentIndex: number; offset: number } {
  // Calculate total "logical" length including inline segments
  let logicalOffset = 0;
  let lastTextSegmentIndex = -1;
  
  for (let i = 0; i < prevSegments.length; i++) {
    const seg = prevSegments[i];
    if (seg.type === 'text') {
      logicalOffset += seg.text.length;
      lastTextSegmentIndex = i;
    } else if (seg.type === 'inline') {
      // Inline segment is ONE cursor position, not one char
      logicalOffset += 1;
    }
  }
  
  // Cursor should be after last segment of prev node
  if (lastTextSegmentIndex >= 0) {
    const lastSeg = prevSegments[lastTextSegmentIndex];
    return {
      segmentIndex: lastTextSegmentIndex,
      offset: lastSeg.type === 'text' ? lastSeg.text.length : 0,
    };
  }
  
  // No text segments, cursor at start of merged node
  return { segmentIndex: 0, offset: 0 };
}
```

**REQUIRED: Update Backspace Handler**

Replace this:

```typescript
// WRONG:
const cursorOffset = prevSegments.reduce((sum, seg) =>
  sum + (seg.type === 'text' ? seg.text.length : 1), 0
);
```

With this:

```typescript
// Step 7: Set cursor (AFTER DOM render)
requestAnimationFrame(() => {
  const mergedElement = document.querySelector(`[data-node-id="${prevNodeId}"]`);
  if (!mergedElement) return;
  
  // Option A: Read from DOM
  const selection = window.getSelection();
  if (selection && selection.rangeCount) {
    const cursor = mapDOMSelectionToCursor(selection, prevNodeId);
    setCursor({
      index: prevIndex,
      segmentIndex: cursor.segmentIndex,
      offset: cursor.offset,
    });
  } else {
    // Fallback: end of prev segments
    const lastSegIndex = prevSegments.length - 1;
    const lastSeg = prevSegments[lastSegIndex];
    setCursor({
      index: prevIndex,
      segmentIndex: lastSegIndex,
      offset: lastSeg.type === 'text' ? lastSeg.text.length : 0,
    });
  }
});
```

**Verification:**
- [ ] Never use `reduce((sum, seg) => sum + ... : 1)` for cursor position
- [ ] Test: Type "Hello @ref", merge with node above → cursor after "o"
- [ ] Test: Type "@ref Hello", merge with node above → cursor after @ref
- [ ] Test: Type, merge, type more → inserts at correct position

---

## FIX #4: Composition (IME) Handling

### Problem
Plan mentions IME in tests but implementation is incomplete.

**What's missing:**
- Explicit `compositionstart` handler
- Explicit `compositionend` handler
- Guard to prevent extraction during composition

**Why this matters:**
- During IME, DOM mutates in non-final ways
- Extracting during composition produces corrupt segments
- Safari and Chrome differ here

**Example:** Typing "你好" in Chinese:
1. Type "ni" → DOM shows "ń"
2. Type "hao" → DOM shows "ńhǎo"
3. Select character → DOM replaces with "你好"

If you extract at step 2, you get corrupt data.

### Fix: Track Composition State + Guard All Boundaries

**Add to `NodeEditor.tsx` state:**

```typescript
// Track IME composition state
const [isComposing, setIsComposing] = useState(false);
const composingNodeId = useRef<string | null>(null);
```

**Add composition handlers:**

```typescript
function handleCompositionStart(nodeId: string) {
  console.log('[Composition] Started on', nodeId);
  setIsComposing(true);
  composingNodeId.current = nodeId;
}

function handleCompositionEnd(nodeId: string) {
  console.log('[Composition] Ended on', nodeId);
  setIsComposing(false);
  composingNodeId.current = null;
  
  // NOW safe to extract if needed
  // (but usually we wait for next commit boundary)
}
```

**Guard ALL commit boundaries:**

```typescript
// At START of every commit boundary:
if (isComposing) {
  console.log('[CommitBoundary] Skipping - composition in progress');
  return;
}
```

**Examples:**

**Enter key:**
```typescript
if (e.key === 'Enter') {
  // GUARD: Don't interrupt composition
  if (isComposing) {
    console.log('[Enter] Blocked - composition active');
    return;
  }
  
  e.preventDefault();
  // ... rest of Enter logic
}
```

**Blur event:**
```typescript
function handleBlur(nodeId: string) {
  // GUARD: Don't extract during composition
  if (isComposing) {
    console.log('[Blur] Blocked - composition active');
    return;
  }
  
  // ... rest of blur logic
}
```

**Arrow keys:**
```typescript
if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
  // GUARD: Don't change nodes during composition
  if (isComposing) {
    console.log('[Arrow] Blocked - composition active');
    return;
  }
  
  // ... rest of arrow logic
}
```

**Add to NodeView render:**

```typescript
<div
  className="node__content"
  contentEditable
  onCompositionStart={() => handleCompositionStart(node.id)}
  onCompositionEnd={() => handleCompositionEnd(node.id)}
  onInput={...}
  onKeyDown={...}
>
```

**Verification:**
- [ ] Composition handlers added to all editable elements
- [ ] `isComposing` state tracked
- [ ] ALL commit boundaries guarded (Enter, Backspace, Blur, Arrow)
- [ ] Test: Type Chinese/Japanese/Korean → correct
- [ ] Test: Type IME, press Enter → Enter blocked until composition ends
- [ ] Test: Type IME, click outside → extraction waits for compositionend

---

## FIX #5: Observer Lifecycle Leak Prevention

### Problem
**Leak scenario:**
1. Node A observer started
2. Node B created
3. Node A DOM removed (structural operation)
4. Observer still attached to dead element

**Consequence:**
- Memory leaks
- Phantom mutations
- Hard-to-debug ghost behavior

Plan has global cleanup on unmount, but not per-node cleanup on deletion.

### Fix: Explicit Destruction on Node Deletion

**Add observer cleanup to ALL structural operations that delete nodes:**

**Backspace merge (current node deleted):**
```typescript
// STEP 1: Stop BOTH observers
const currentObserver = domObservers.current.get(currentNodeId);
const prevObserver = domObservers.current.get(prevNodeId);

if (currentObserver) {
  currentObserver.stop();
  currentObserver.destroy(); // ADD THIS
  domObservers.current.delete(currentNodeId); // ADD THIS
}

if (prevObserver) {
  prevObserver.stop();
}
```

**Node deletion (e.g., delete empty node):**
```typescript
function deleteNode(nodeId: string) {
  // 1. Destroy observer FIRST
  const observer = domObservers.current.get(nodeId);
  if (observer) {
    observer.destroy();
    domObservers.current.delete(nodeId);
    console.log('[DeleteNode] Observer destroyed for', nodeId);
  }
  
  // 2. Remove from model
  const index = editorModelIndex.nodes.findIndex(n => n.id === nodeId);
  if (index >= 0) {
    editorModelIndex.nodes.splice(index, 1);
  }
  
  // 3. Commit
  commit('delete-node');
}
```

**Add to invariants:**

```markdown
## Invariant: Observer Lifecycle

**Rule:** Any structural operation that deletes a node MUST destroy its observer.

**Operations that delete nodes:**
- Backspace merge (current node deleted)
- Delete empty node
- Cut operation (if node removed)
- Undo/redo that removes nodes

**Enforcement:**
```typescript
// Before node deletion:
const observer = domObservers.current.get(nodeId);
if (observer) {
  observer.destroy();
  domObservers.current.delete(nodeId);
}
```

**Verification:**
- [ ] Search codebase for `nodes.splice` → each has observer cleanup
- [ ] Search for `removeNode` / `deleteNode` → each has observer cleanup
- [ ] Add to test checklist: "No zombie observers after 100 operations"
- [ ] Use Chrome DevTools Memory profiler: node count shouldn't grow

---

## FIX #6: Commit Boundary Contract

### Problem
Plan uses commit boundaries correctly but doesn't codify them.
This is how regressions happen 2-4 weeks later.

Need explicit contract that's referenced in code and docs.

### Fix: Write Commit Boundary Contract

**Create: `COMMIT-BOUNDARY-CONTRACT.md`**

```markdown
# Commit Boundary Contract

## Definition

A **commit boundary** is any operation that transitions from "typing in progress" 
to "structural change" or "persistence."

## Examples of Commit Boundaries

1. Enter key (creates new node)
2. Backspace at start (merges nodes)
3. Blur event (saves changes)
4. Arrow key node change (saves current, loads new)
5. Tab/Shift+Tab (indent/outdent)
6. Cut operation
7. Undo/redo
8. Any structural mutation

## The Contract

A commit boundary implementation MUST execute these steps IN ORDER:

### Step 1: Guard Composition
```typescript
if (isComposing) {
  return; // Don't interrupt IME
}
```

### Step 2: Stop All Relevant MutationObservers
```typescript
const observer = domObservers.current.get(nodeId);
if (observer) {
  observer.stop();
}
```

### Step 3: Read Fresh DOM → Segments
```typescript
const element = document.querySelector(`[data-node-id="${nodeId}"]`);
const segments = extractSegmentsFromDOM(element);
```

### Step 4: Read Fresh DOM → Selection
```typescript
const selection = window.getSelection();
const cursor = mapDOMSelectionToCursor(selection, nodeId);
```

### Step 5: Update Node with Fresh Data
```typescript
const node = editorModelIndex.nodes[index];
node.segments = segments;
```

### Step 6: Perform Structural Mutation
```typescript
// Examples:
editorModelIndex.nodes.splice(index, 1, head, tail); // Split
editorModelIndex.nodes.splice(index, 1); // Delete
node.indent += 1; // Indent
```

### Step 7: Commit Transaction
```typescript
commit('enter'); // or 'backspace', 'blur', etc.
```

### Step 8: Clear Observer Diagnostics
```typescript
observer.clearPendingMutations();
```

### Step 9: Set Cursor (After Render)
```typescript
setCursor({ index, segmentIndex, offset });
```

### Step 10: Restart Observers (After Render)
```typescript
requestAnimationFrame(() => {
  const newElement = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (newElement) {
    const observer = domObservers.current.get(nodeId);
    if (observer) {
      observer.start();
    }
  }
});
```

## Invalid Commit Boundaries

These are INVALID and will cause bugs:

### ❌ Missing Composition Guard
```typescript
// BAD: No composition check
if (e.key === 'Enter') {
  extractSegmentsFromDOM(element); // WRONG: might be mid-composition
}
```

### ❌ Observer Not Stopped
```typescript
// BAD: Observer still running during extraction
const segments = extractSegmentsFromDOM(element); // WRONG: race condition
```

### ❌ Using Stale Segments
```typescript
// BAD: Using segments from state, not DOM
const node = editorModelIndex.nodes[index];
const [head, tail] = split(node); // WRONG: stale segments
```

### ❌ Setting Cursor Before Render
```typescript
// BAD: DOM hasn't rendered yet
editorModelIndex.nodes.splice(index, 1, head, tail);
setCursor({ index: index + 1, ... }); // WRONG: tail not rendered
```

### ❌ Not Restarting Observer
```typescript
// BAD: Observer left stopped
observer.stop();
extractSegmentsFromDOM(element);
commit('enter');
// WRONG: forgot to restart observer
```

## Enforcement

1. Every keyboard handler that modifies structure MUST follow this contract
2. Code review MUST verify all 10 steps
3. If a step is not applicable (e.g., no cursor change), add explicit comment:
   ```typescript
   // Step 9: Cursor unchanged - no action needed
   ```
4. Deviation from contract requires architectural approval

## Testing

After implementing any commit boundary:
- [ ] Composition doesn't break it (type IME)
- [ ] Observer restarts correctly (type after operation)
- [ ] No stale data (verify segments match DOM)
- [ ] Cursor lands correctly (verify offset)
- [ ] No memory leaks (check observer count)
```

**Reference contract in code:**

```typescript
// ===== COMMIT BOUNDARY: Enter Key =====
// Follows COMMIT-BOUNDARY-CONTRACT.md

if (e.key === 'Enter') {
  // Step 1: Guard composition
  if (isComposing) return;
  
  // Step 2: Stop observers
  const observer = domObservers.current.get(nodeId);
  if (observer) observer.stop();
  
  // Step 3: Read fresh DOM → segments
  const segments = extractSegmentsFromDOM(element);
  
  // ... etc
}
```

**Verification:**
- [ ] Contract document created
- [ ] All commit boundaries reference contract
- [ ] Code comments reference contract steps
- [ ] Checklist in PR template: "Follows commit boundary contract?"

---

## INTEGRATION INTO PLAN

### Where to Add These Fixes

**Pre-Flight Checklist (before Phase 0):**
- [ ] Read `MUTATION-OBSERVER-CRITICAL-FIXES.md`
- [ ] Understand all 6 fixes
- [ ] Acknowledge that skipping any fix will cause bugs

**Phase 1, Step 1.1 (Create DOMObserver):**
- [ ] Add Fix #1 invariant comments
- [ ] Add Fix #2 non-authoritative warnings
- [ ] Include both in implementation

**Phase 1, Step 1.2 (Add to NodeEditor):**
- [ ] Add Fix #4 composition state tracking
- [ ] Add composition handlers to render

**Phase 2, Step 2.3 (Switch Enter):**
- [ ] Add Fix #4 composition guard
- [ ] Follow Fix #6 commit boundary contract
- [ ] Verify all 10 steps

**Phase 2, Step 2.4 (Switch Backspace):**
- [ ] Add Fix #3 correct cursor offset calculation
- [ ] Add Fix #4 composition guard
- [ ] Add Fix #5 observer destruction on node delete
- [ ] Follow Fix #6 commit boundary contract

**Phase 4, Step 4.2 (Manual Testing):**
- [ ] Add IME/composition tests from Fix #4
- [ ] Add inline segment cursor tests from Fix #3
- [ ] Add memory leak tests from Fix #5

**Phase 5 (Documentation):**
- [ ] Create `COMMIT-BOUNDARY-CONTRACT.md` from Fix #6
- [ ] Add invariants to `EDITOR-ARCHITECTURE.md` from Fix #1
- [ ] Reference contract in code comments

---

## VERIFICATION CHECKLIST

Before declaring Phase 1 complete:

**Fix #1 (Selection Invariant):**
- [ ] Comment added to `DOMObserver.ts` header
- [ ] Invariant documented in `EDITOR-ARCHITECTURE.md`
- [ ] All commit boundaries read `window.getSelection()`
- [ ] Grep codebase: no cursor inference from mutations

**Fix #2 (Batching Non-Authoritative):**
- [ ] Warning comment on `pendingMutations`
- [ ] JSDoc warnings on getter methods
- [ ] `clearPendingMutations()` called after all commits
- [ ] Grep codebase: no logic branches on mutation contents

**Fix #3 (Cursor Offset):**
- [ ] Never use `reduce((sum, seg) => sum + ... : 1)`
- [ ] Cursor derived from DOM or segment-aware math
- [ ] Test: Merge with inline refs → cursor correct
- [ ] Test: Type after merge → inserts at right place

**Fix #4 (Composition Handling):**
- [ ] `isComposing` state tracked
- [ ] Composition handlers on all editable elements
- [ ] ALL commit boundaries guarded
- [ ] Test: Type IME → correct
- [ ] Test: Enter during IME → blocked
- [ ] Test: Blur during IME → waits

**Fix #5 (Lifecycle Leaks):**
- [ ] Observer destroyed on node deletion (all paths)
- [ ] Search `nodes.splice` → all have cleanup
- [ ] Test: 100 operations → no zombie observers
- [ ] Chrome DevTools: observer count stable

**Fix #6 (Commit Contract):**
- [ ] `COMMIT-BOUNDARY-CONTRACT.md` created
- [ ] All boundaries reference contract
- [ ] Code comments cite contract steps
- [ ] PR template includes contract checklist

---

## FINAL VERIFICATION

**Before starting Phase 0:**

Run this command:

```bash
echo "Pre-flight check:"
echo "[ ] Read MUTATION-OBSERVER-CRITICAL-FIXES.md"
echo "[ ] Understand all 6 fixes"
echo "[ ] Acknowledge consequences of skipping fixes"
echo ""
echo "Type 'READY' to proceed:"
read response
if [ "$response" != "READY" ]; then
  echo "Fix understanding incomplete. Read again."
  exit 1
fi
```

**After Phase 2 complete:**

Run these greps to verify fixes integrated:

```bash
# Fix #1: Selection invariant
rg "window\.getSelection\(\)" apps/engine-demo/src/NodeEditor.tsx
# Should find: Enter, Backspace, Blur, Arrow handlers

# Fix #2: Batching warnings
rg "FOR DIAGNOSTICS ONLY" apps/engine-demo/src/editor/DOMObserver.ts
# Should find: comment on pendingMutations

# Fix #3: No naive offset calculation
rg "reduce.*seg.*\+.*1" apps/engine-demo/src/NodeEditor.tsx
# Should find: ZERO results (no naive reduction)

# Fix #4: Composition guards
rg "if \(isComposing\)" apps/engine-demo/src/NodeEditor.tsx
# Should find: Enter, Backspace, Blur, Arrow handlers

# Fix #5: Observer destruction
rg "observer\.destroy\(\)" apps/engine-demo/src/NodeEditor.tsx
# Should find: Backspace merge, delete operations

# Fix #6: Contract references
rg "COMMIT-BOUNDARY-CONTRACT" apps/engine-demo/src/NodeEditor.tsx
# Should find: references in Enter, Backspace handlers
```

If any grep fails, fixes incomplete. DO NOT PROCEED.

---

## ACKNOWLEDGMENT

These 6 fixes were identified through rigorous audit.

**They are not optional.**

Skipping any fix will cause bugs within 2-4 weeks of deployment.

Every fix has been:
- Explained (why it matters)
- Specified (exact code)
- Located (where it goes)
- Verified (how to check)

**No excuses. No shortcuts.**

Implement all 6 fixes or do not start the refactor.

---

END OF CRITICAL FIXES
