# Commit Boundary Contract

**Status:** MANDATORY - All structural operations MUST follow this protocol
**Created:** Phase 0, Fix #6
**Purpose:** Zero-ambiguity reference for all commit boundaries

---

## Definition

A **commit boundary** is any point where:

1. DOM changes must be extracted to the model
2. Model changes must trigger React re-render
3. Cursor position must be synchronized

**Examples:**

- Enter key (split node)
- Backspace at node start (merge nodes)
- Arrow key to different node (change focus)
- Blur (leave node)
- Debounce timeout (periodic flush)

---

## The 10-Step Protocol

**Every commit boundary MUST execute these steps in order:**

```typescript
// 1. GUARD: Check composition state
if (isComposing) {
  console.log('[CommitBoundary] Blocked - composition active');
  return;
}

// 2. STOP: Stop all relevant MutationObservers
const observer = domObservers.current.get(nodeId);
if (observer) {
  observer.stop();
  console.log('[CommitBoundary] Observer stopped');
}

// 3. EXTRACT: Read fresh DOM → segments
const element = document.querySelector(`[data-node-id="${nodeId}"]`);
if (!element) return;
const segments = extractSegmentsFromDOM(element as HTMLElement);
console.log('[CommitBoundary] Extracted segments:', segments);

// 4. CURSOR: Read fresh DOM → selection
const selection = window.getSelection();
if (!selection) return;
const cursor = mapDOMSelectionToCursor(selection, nodeId);
console.log('[CommitBoundary] Cursor:', cursor);

// 5. UPDATE: Update node.segments with fresh data
node.segments = segments;

// 6. MUTATE: Perform model mutation (split, merge, etc.)
const newNodes = performStructuralOperation(node, cursor);

// 7. COMMIT: Trigger React setState
commit({
  nodes: newNodes,
  cursor: newCursor,
});

// 8. CLEAR: Clear observer diagnostics
if (observer) {
  observer.clearPendingMutations();
}

// 9. RENDER: Wait for React render (if async operation)
requestAnimationFrame(() => {
  // 10. RESTART: Start observer on new/updated node
  const newObserver = domObservers.current.get(newNodeId);
  if (newObserver) {
    newObserver.start();
    console.log('[CommitBoundary] Observer restarted');
  }

  // Place cursor after render
  requestCaretPlacement();
});
```

---

## Step-by-Step Breakdown

### Step 1: Composition Guard

**Why:** IME composition produces non-final DOM mutations. Extracting during composition produces corrupt segments.

**Implementation:**

```typescript
if (isComposing) return;
```

**Requirements:**

- Check BEFORE any other logic
- No exceptions (even for "safe" operations)
- Log when blocked (for debugging)

**Failure mode:** Corrupt segments, missing characters, wrong cursor position

---

### Step 2: Stop Observers

**Why:** Prevent mutations during structural operation. Observer must not fire while we're reading/writing.

**Implementation:**

```typescript
const observer = domObservers.current.get(nodeId);
if (observer) observer.stop();
```

**Requirements:**

- Stop ALL relevant observers (both nodes for merge)
- Stop BEFORE extraction
- Check observer exists (may be unmounted)

**Failure mode:** Observer fires mid-operation, mutations logged during commit, race conditions

---

### Step 3: Extract Segments

**Why:** Get authoritative, fresh segments from DOM. This is THE single source of truth.

**Implementation:**

```typescript
const element = document.querySelector(`[data-node-id="${nodeId}"]`);
const segments = extractSegmentsFromDOM(element);
```

**Requirements:**

- Extract from actual DOM (not from React props)
- Handle missing elements gracefully
- Parse text + inline elements correctly

**Failure mode:** Stale segments used, zombie data, wrong split/merge

---

### Step 4: Read Cursor

**Why:** Cursor position is NOT inferred from mutations. Must read from browser selection API.

**Implementation:**

```typescript
const selection = window.getSelection();
const cursor = mapDOMSelectionToCursor(selection, nodeId);
```

**Requirements:**

- ALWAYS read from `window.getSelection()`
- NEVER infer from segments or mutations
- Handle collapsed vs non-collapsed selection

**Failure mode:** Cursor jumps, wrong insertion point, selection bugs

---

### Step 5: Update Node

**Why:** Ensure model has fresh data before structural operation.

**Implementation:**

```typescript
node.segments = segments;
```

**Requirements:**

- Update BEFORE split/merge
- Use fresh segments from step 3
- Don't mutate original (if immutable pattern)

**Failure mode:** Operation uses stale node data

---

### Step 6: Perform Mutation

**Why:** Execute the actual structural change (split, merge, delete, etc.)

**Implementation:**

```typescript
const newNodes = performStructuralOperation(node, cursor);
```

**Requirements:**

- Use index-based operations (not nodeId-based)
- Return new nodes array (immutable)
- Calculate new cursor position

**Failure mode:** Wrong node modified, index misalignment, structure corruption

---

### Step 7: Commit to React

**Why:** Trigger React re-render with new model state.

**Implementation:**

```typescript
commit({
  nodes: newNodes,
  cursor: newCursor,
});
```

**Requirements:**

- Call AFTER model mutation
- Include both nodes and cursor
- Use `withStructuralCommit` wrapper if needed

**Failure mode:** React out of sync, stale UI, cursor not updated

---

### Step 8: Clear Diagnostics

**Why:** Prevent stale mutation logs from affecting next operation (Fix #2).

**Implementation:**

```typescript
if (observer) observer.clearPendingMutations();
```

**Requirements:**

- Clear AFTER commit
- Clear ALL observers involved
- Don't skip this (accumulation bug)

**Failure mode:** Memory leak, confusing diagnostic logs

---

### Step 9: Wait for Render

**Why:** React render is asynchronous. Must wait for DOM to update before restarting observer.

**Implementation:**

```typescript
requestAnimationFrame(() => {
  // Step 10 here
});
```

**Requirements:**

- Use `requestAnimationFrame` or `useLayoutEffect`
- Wait BEFORE restarting observer
- Handle unmounted nodes (cleanup)

**Failure mode:** Observer restarts on stale DOM, mutations logged incorrectly

---

### Step 10: Restart Observer

**Why:** Resume watching for user edits after structural operation completes.

**Implementation:**

```typescript
const newObserver = domObservers.current.get(newNodeId);
if (newObserver) newObserver.start();
```

**Requirements:**

- Restart AFTER React render
- Restart on correct node (may be different after split/merge)
- Check observer exists (may be new node)

**Failure mode:** Typing not tracked, no auto-save, state divergence

---

## Commit Boundary Catalog

### 1. Enter Key

**Type:** Split operation

**Nodes involved:** 1 (becomes 2 after split)

**Special handling:**

- Cursor goes to new node (index + 1)
- New observer created for new node
- Old observer stays on old node

**Code location:** `NodeEditor.tsx` Enter handler

**Contract adherence:**

```typescript
if (isComposing) return; // Step 1
observer.stop(); // Step 2
const segments = extractSegmentsFromDOM(element); // Step 3
const cursor = mapDOMSelectionToCursor(selection, nodeId); // Step 4
node.segments = segments; // Step 5
const [head, tail] = performGuaranteedSplit(node, cursor); // Step 6
commit({ nodes: [...head, tail, ...rest], cursor: newCursor }); // Step 7
observer.clearPendingMutations(); // Step 8
requestAnimationFrame(() => {
  // Step 9
  newObserver.start(); // Step 10
  requestCaretPlacement();
});
```

---

### 2. Backspace Merge

**Type:** Merge operation

**Nodes involved:** 2 (current + previous)

**Special handling:**

- Current node observer must be DESTROYED (not just stopped) - Fix #5
- Previous node observer stops, then restarts
- Cursor math for inline segments (Fix #3)

**Code location:** `NodeEditor.tsx` Backspace handler

**Contract adherence:**

```typescript
if (isComposing) return; // Step 1

// Stop AND destroy current node observer (Fix #5)
const currentObserver = domObservers.current.get(currentNodeId);
if (currentObserver) {
  currentObserver.stop(); // Step 2
  currentObserver.destroy(); // Fix #5
  domObservers.current.delete(currentNodeId); // Fix #5
}

// Stop previous node observer
const prevObserver = domObservers.current.get(prevNodeId);
if (prevObserver) prevObserver.stop();

// Extract from BOTH nodes
const currentSegments = extractSegmentsFromDOM(currentElement); // Step 3
const prevSegments = extractSegmentsFromDOM(prevElement); // Step 3

const cursor = mapDOMSelectionToCursor(selection, currentNodeId); // Step 4

// Merge
const merged = { ...prevNode, segments: [...prevSegments, ...currentSegments] }; // Step 5 + 6

commit({ nodes: updatedNodes, cursor: newCursor }); // Step 7

if (prevObserver) prevObserver.clearPendingMutations(); // Step 8

requestAnimationFrame(() => {
  // Step 9
  // Read cursor from DOM after render (Fix #3)
  const mergedElement = document.querySelector(
    `[data-node-id="${prevNodeId}"]`
  );
  const freshSelection = window.getSelection();
  const freshCursor = mapDOMSelectionToCursor(freshSelection, prevNodeId);

  setCursor(freshCursor); // Update cursor from actual DOM

  if (prevObserver) prevObserver.start(); // Step 10
  requestCaretPlacement();
});
```

**CRITICAL (Fix #3):** Cursor calculation must use DOM, not segment.reduce()

---

### 3. Blur

**Type:** Flush operation

**Nodes involved:** 1 (current)

**Special handling:**

- Observer does NOT restart (node no longer active)
- Cursor may be null (focus left)

**Code location:** `NodeEditor.tsx` blur handler

**Contract adherence:**

```typescript
if (isComposing) return; // Step 1
observer.stop(); // Step 2
const segments = extractSegmentsFromDOM(element); // Step 3
const cursor = mapDOMSelectionToCursor(selection, nodeId) || editorState.cursor; // Step 4
node.segments = segments; // Step 5
// No structural mutation (step 6 skipped)
commit({ nodes: updatedNodes, cursor }); // Step 7
observer.clearPendingMutations(); // Step 8
// Step 9 skipped - don't restart (blur means no longer editing)
requestCaretPlacement(); // Step 10 (partial)
```

---

### 4. Arrow Keys (Node Change)

**Type:** Focus change operation

**Nodes involved:** 2 (old + new)

**Special handling:**

- Old observer stops
- New observer starts
- Cursor moves to new node

**Code location:** `NodeEditor.tsx` arrow key handler

**Contract adherence:**

```typescript
if (isComposing) return; // Step 1

// Stop old observer
const oldObserver = domObservers.current.get(oldNodeId);
if (oldObserver) oldObserver.stop(); // Step 2

// Extract from old node
const oldSegments = extractSegmentsFromDOM(oldElement); // Step 3
const oldCursor = mapDOMSelectionToCursor(selection, oldNodeId); // Step 4
oldNode.segments = oldSegments; // Step 5

// Update model
commit({ nodes: updatedNodes, cursor: newCursor }); // Step 7

if (oldObserver) oldObserver.clearPendingMutations(); // Step 8

requestAnimationFrame(() => {
  // Step 9
  // Start new observer
  const newObserver = domObservers.current.get(newNodeId);
  if (newObserver) newObserver.start(); // Step 10
  requestCaretPlacement();
});
```

---

### 5. Debounce

**Type:** Periodic flush operation

**Nodes involved:** All nodes with pending changes

**Special handling:**

- Multiple nodes may be flushed
- Observers restart after flush
- Cursor stays where it is

**Code location:** `NodeEditor.tsx` debounce effect

**Contract adherence:**

```typescript
if (isComposing) return; // Step 1

// Stop all observers with pending changes
const pendingNodeIds = [...domObservers.current.keys()];
pendingNodeIds.forEach((id) => {
  const obs = domObservers.current.get(id);
  if (obs) obs.stop(); // Step 2
});

// Extract from all pending nodes
const updatedNodes = editorState.nodes.map((node) => {
  const element = document.querySelector(`[data-node-id="${node.id}"]`);
  if (!element) return node;
  const segments = extractSegmentsFromDOM(element); // Step 3
  return { ...node, segments };
});

const cursor = mapDOMSelectionToCursor(selection, currentNodeId); // Step 4

commit({ nodes: updatedNodes, cursor }); // Step 7

// Clear all diagnostics
pendingNodeIds.forEach((id) => {
  const obs = domObservers.current.get(id);
  if (obs) obs.clearPendingMutations(); // Step 8
});

requestAnimationFrame(() => {
  // Step 9
  // Restart all observers
  pendingNodeIds.forEach((id) => {
    const obs = domObservers.current.get(id);
    if (obs) obs.start(); // Step 10
  });
  requestCaretPlacement();
});
```

---

## Verification Checklist

**For every new commit boundary, verify:**

- [ ] Step 1: Composition guard at the very start
- [ ] Step 2: Observer stopped before extraction
- [ ] Step 3: `extractSegmentsFromDOM()` called on actual DOM element
- [ ] Step 4: `window.getSelection()` called (not inferred)
- [ ] Step 5: `node.segments` updated with fresh data
- [ ] Step 6: Structural operation performed (if applicable)
- [ ] Step 7: `commit()` called with new state
- [ ] Step 8: `observer.clearPendingMutations()` called
- [ ] Step 9: `requestAnimationFrame` wraps step 10
- [ ] Step 10: Observer restarted on correct node

**Additional checks:**

- [ ] Fix #3 applied if cursor calculation involves inline segments
- [ ] Fix #5 applied if node is deleted (observer destroyed)
- [ ] Contract reference added in code comment
- [ ] Console logs for debugging (removable later)

---

## Anti-Patterns (DO NOT DO THIS)

### ❌ Skip composition guard

```typescript
// WRONG - no composition check
observer.stop();
const segments = extractSegmentsFromDOM(element);
```

**Why wrong:** IME input will corrupt segments

**Correct:**

```typescript
if (isComposing) return;
observer.stop();
const segments = extractSegmentsFromDOM(element);
```

---

### ❌ Extract before stopping observer

```typescript
// WRONG - observer still running
const segments = extractSegmentsFromDOM(element);
observer.stop();
```

**Why wrong:** Observer may fire during extraction, causing race condition

**Correct:**

```typescript
observer.stop();
const segments = extractSegmentsFromDOM(element);
```

---

### ❌ Infer cursor from mutations

```typescript
// WRONG - inferring cursor
const cursorOffset = pendingMutations[0].range.startOffset;
```

**Why wrong:** Mutations don't reliably track cursor (Fix #1)

**Correct:**

```typescript
const selection = window.getSelection();
const cursor = mapDOMSelectionToCursor(selection, nodeId);
```

---

### ❌ Skip clearing diagnostics

```typescript
// WRONG - diagnostics accumulate
commit({ nodes, cursor });
observer.start();
```

**Why wrong:** Memory leak, confusing logs (Fix #2)

**Correct:**

```typescript
commit({ nodes, cursor });
observer.clearPendingMutations();
requestAnimationFrame(() => observer.start());
```

---

### ❌ Restart observer before render

```typescript
// WRONG - observer watches stale DOM
commit({ nodes, cursor });
observer.start();
```

**Why wrong:** React hasn't rendered yet, DOM is stale

**Correct:**

```typescript
commit({ nodes, cursor });
requestAnimationFrame(() => observer.start());
```

---

### ❌ Calculate cursor for inline segments naively

```typescript
// WRONG - inline segments are NOT length 1
const offset = prevSegments.reduce(
  (sum, seg) => sum + (seg.type === 'text' ? seg.text.length : 1),
  0
);
```

**Why wrong:** Inline elements render as atomic blocks, not single characters (Fix #3)

**Correct:**

```typescript
requestAnimationFrame(() => {
  const freshSelection = window.getSelection();
  const cursor = mapDOMSelectionToCursor(freshSelection, nodeId);
  setCursor(cursor);
});
```

---

### ❌ Forget to destroy observer on node deletion

```typescript
// WRONG - observer leaks
const updated = removeNode(nodes, nodeId);
commit({ nodes: updated, cursor });
```

**Why wrong:** Observer still attached to deleted node, memory leak (Fix #5)

**Correct:**

```typescript
const observer = domObservers.current.get(nodeId);
if (observer) {
  observer.stop();
  observer.destroy();
  domObservers.current.delete(nodeId);
}
const updated = removeNode(nodes, nodeId);
commit({ nodes: updated, cursor });
```

---

## Code Comment Template

**Use this at the start of every commit boundary:**

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMIT BOUNDARY: [Operation Name]
// Contract: COMMIT-BOUNDARY-CONTRACT.md
// Nodes: [List of nodes involved]
// Special: [Any deviations from standard contract]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Step 1: Guard composition
if (isComposing) return;

// Step 2: Stop observers
// ... rest of steps
```

**Example:**

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMIT BOUNDARY: Backspace Merge
// Contract: COMMIT-BOUNDARY-CONTRACT.md
// Nodes: current (deleted) + previous (merged into)
// Special: Fix #5 (observer destroyed), Fix #3 (cursor from DOM after render)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Testing Strategy

**For each commit boundary, test:**

1. **Normal case** - Operation succeeds, cursor correct
2. **IME case** - Operation blocked during composition
3. **Rapid case** - Multiple operations in quick succession
4. **Edge case** - Empty nodes, inline elements, selection ranges
5. **Error case** - Missing elements, null selection

**Specific tests:**

```typescript
// Test composition guard
test('Enter key blocked during composition', () => {
  setIsComposing(true);
  pressEnter();
  expect(model.nodes.length).toBe(1); // Not split
});

// Test observer lifecycle
test('Observer restarted after Enter', async () => {
  pressEnter();
  await nextFrame();
  const observer = getObserver(newNodeId);
  expect(observer.isObserving).toBe(true);
});

// Test cursor accuracy (Fix #3)
test('Cursor correct after Backspace merge with inline elements', () => {
  // prevNode: "Hello @ref world"
  // currentNode: "|"
  pressBackspace();
  expect(cursor).toEqual({
    nodeId: prevNodeId,
    segmentIndex: 3, // After "world"
    offset: 5,
  });
});
```

---

## Emergency Rollback Conditions

**If ANY of these occur, HALT and fix:**

1. Cursor jumps during normal operation
2. Content duplicates (zombie segments)
3. Content disappears (data loss)
4. IME input corrupts text
5. Memory grows unbounded (observer leak)
6. Race conditions observed (commits during typing)

**These are ZERO-TOLERANCE bugs** - presence of any means contract is not followed correctly.

---

END OF COMMIT BOUNDARY CONTRACT
