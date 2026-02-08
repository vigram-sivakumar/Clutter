# MUTATION OBSERVER REFACTOR - STRICT IMPLEMENTATION PLAN

## 🎯 OBJECTIVE

Replace the `TypingBuffer` with `MutationObserver` to make DOM the source of truth during typing, eliminating:
- Stale segment bugs
- Zombie segments
- `isTyping()` flag corruption
- Race conditions between DOM and buffer

**ZERO TOLERANCE for "old logic clashing" or "we missed this" excuses.**

---

## 📋 PRE-FLIGHT CHECKLIST

### MUST VERIFY BEFORE STARTING

- [ ] **1. Current State Baseline**
  - [ ] Git commit with clean working tree
  - [ ] All tests passing (if any exist)
  - [ ] Document current bugs in `KNOWN-BUGS-BEFORE.md`
  - [ ] Take screenshots of working features

- [ ] **2. Instance Architecture Verified**
  - [ ] Confirm `EditorModelIndex` is instance-based (not singleton)
  - [ ] Confirm `TypingBuffer` has instance methods
  - [ ] Confirm `CommitPipeline` is instance-based
  - [ ] Verify no global state dependencies

- [ ] **3. Full Dependency Map Created**
  - [ ] List ALL files that import `TypingBuffer`
  - [ ] List ALL files that call `isTyping()`
  - [ ] List ALL files that call typing buffer methods
  - [ ] List ALL files that handle DOM input events
  - [ ] Document the call graph

- [ ] **4. Test Coverage Documented**
  - [ ] List what CAN be tested automatically
  - [ ] List what MUST be tested manually
  - [ ] Create test checklist for each keyboard operation
  - [ ] Define acceptance criteria for each operation

- [ ] **5. Rollback Strategy Defined**
  - [ ] Create rollback branch `backup-before-mutation-observer`
  - [ ] Document how to revert each step
  - [ ] Test rollback procedure (create test branch, rollback, verify)

---

## 🔍 COMPLETE DEPENDENCY ANALYSIS

### Phase 0: Exhaustive Scanning (DO THIS FIRST)

#### Step 0.1: Scan ALL TypingBuffer Usage

```bash
# Run these commands and document results

# Find all imports
rg "from.*TypingBuffer" --type ts

# Find all direct usages
rg "typingBuffer\." --type ts

# Find all isTyping calls
rg "isTyping\(\)" --type ts

# Find all typing-related state
rg "isTyping|typing" --type ts -i

# Find all startTyping/stopTyping calls
rg "(startTyping|stopTyping)" --type ts
```

**DOCUMENT RESULTS:**
- [ ] Create `TYPING-BUFFER-USAGE.md` with complete list
- [ ] For each usage, note: file, line, purpose, can it be deleted?
- [ ] Mark which usages are in hot paths (Enter, Backspace, typing)
- [ ] Identify any usages we didn't know about

#### Step 0.2: Scan ALL DOM Event Handlers

```bash
# Find all input handlers
rg "onInput|handleInput|input.*=" --type ts

# Find all keydown handlers  
rg "onKeyDown|handleKeyDown|keydown" --type ts

# Find all beforeinput handlers
rg "onBeforeInput|handleBeforeInput|beforeinput" --type ts

# Find all compositionstart/end
rg "composition(start|end)" --type ts
```

**DOCUMENT RESULTS:**
- [ ] Create `DOM-HANDLERS.md` with complete list
- [ ] For each handler, note: what it does, does it modify segments?
- [ ] Identify overlapping/duplicate handlers
- [ ] Mark which handlers will be replaced by MutationObserver

#### Step 0.3: Map Data Flow

**DRAW THIS OUT (ASCII or tool):**

```
Current Flow:
User types → input event → handleSegmentedInput → 
setPendingSegments → TypingBuffer.set → 
onCommit → flushPendingSegments → model update

New Flow:
User types → DOM mutates → MutationObserver fires →
extractSegmentsFromDOM → queue commit →
onCommit boundary → extract segments → model update
```

**IDENTIFY EVERY TRANSFORMATION POINT:**
- [ ] Where does text become segments? (handleSegmentedInput)
- [ ] Where do segments become text? (renderSegments)
- [ ] Where does cursor position get set? (requestCaretPlacement)
- [ ] Where does model update? (updateModel, commit)

#### Step 0.4: Identify ALL Commit Boundaries

**LIST EVERY PLACE WHERE TYPING ENDS:**
- [ ] Enter key
- [ ] Backspace at start (merge)
- [ ] Blur event (focus leaves)
- [ ] Arrow keys (node change)
- [ ] Click outside (focus change)
- [ ] Undo/redo
- [ ] Any other structural operation

**For each boundary, document:**
- Current: How does it flush typing buffer?
- New: How will it extract from DOM?
- Risk: What could go wrong?

---

## 📦 STEP-BY-STEP IMPLEMENTATION

### ⚠️ RULES

1. **One atomic change at a time** - No "while we're here" refactors
2. **Verify after each step** - Don't proceed until proven working
3. **Keep old code** - Comment out, don't delete until confirmed working
4. **Add, don't replace** - New code alongside old code first
5. **Test exhaustively** - Manual test every operation after each step

---

### PHASE 1: ADD (Don't Replace)

**Goal:** Add MutationObserver WITHOUT touching existing code

#### Step 1.1: Create DOMObserver Module

**File:** `apps/engine-demo/src/editor/DOMObserver.ts`

**Requirements:**
- [ ] Export `DOMObserver` class
- [ ] Export `extractSegmentsFromDOM` function
- [ ] Must be instance-based (no singletons)
- [ ] Must handle disconnection gracefully
- [ ] Must accumulate mutations, not process immediately

**Implementation:**

```typescript
import { Segment } from './EditorModel.index';

export interface DOMObserverConfig {
  element: HTMLElement;
  onMutationsBatched?: (mutations: MutationRecord[]) => void;
}

export class DOMObserver {
  private observer: MutationObserver;
  private element: HTMLElement;
  private isObserving = false;
  private pendingMutations: MutationRecord[] = [];
  
  constructor(config: DOMObserverConfig) {
    this.element = config.element;
    
    // Create observer
    this.observer = new MutationObserver((mutations) => {
      // Don't process immediately - batch them
      this.pendingMutations.push(...mutations);
      
      if (config.onMutationsBatched) {
        config.onMutationsBatched(mutations);
      }
    });
  }
  
  start() {
    if (this.isObserving) return;
    
    this.observer.observe(this.element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    
    this.isObserving = true;
    console.log('[DOMObserver] Started observing');
  }
  
  stop() {
    if (!this.isObserving) return;
    
    this.observer.disconnect();
    this.isObserving = false;
    console.log('[DOMObserver] Stopped observing');
  }
  
  getPendingMutations(): MutationRecord[] {
    return [...this.pendingMutations];
  }
  
  clearPendingMutations() {
    this.pendingMutations = [];
  }
  
  destroy() {
    this.stop();
  }
}

/**
 * Extract segments from DOM element
 * This is the NEW way to get segments (replaces handleSegmentedInput)
 */
export function extractSegmentsFromDOM(element: HTMLElement): Segment[] {
  const segments: Segment[] = [];
  
  // Walk through child nodes
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        segments.push({ type: 'text', text });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      
      // Handle inline elements (refs, etc.)
      if (el.classList.contains('inline-element')) {
        const inlineId = el.getAttribute('data-inline-id');
        if (!inlineId) continue;
        
        // Determine kind based on classes
        let kind: 'ref' | 'tag' = 'ref';
        if (el.classList.contains('inline-ref')) kind = 'ref';
        else if (el.classList.contains('inline-tag')) kind = 'tag';
        
        segments.push({
          type: 'inline',
          kind,
          id: inlineId,
          payload: { type: 'reference', targetId: inlineId },
        });
      }
      
      // Handle caret-anchor spans (skip them)
      else if (el.classList.contains('caret-anchor')) {
        continue;
      }
      
      // Unknown elements - treat as text
      else {
        const text = el.textContent || '';
        if (text) {
          segments.push({ type: 'text', text });
        }
      }
    }
  }
  
  return segments;
}
```

**Verification:**
- [ ] File compiles without errors
- [ ] No imports of TypingBuffer
- [ ] No global state
- [ ] Run basic test: create observer, start/stop, verify no crashes

#### Step 1.2: Add DOMObserver to NodeEditor Instance

**File:** `apps/engine-demo/src/NodeEditor.tsx`

**Add to component state (around line 100):**

```typescript
// NEW: MutationObserver for each node
const domObservers = useRef<Map<string, DOMObserver>>(new Map());
```

**Add initialization function:**

```typescript
// Initialize DOM observer for a node
function initializeDOMObserver(nodeId: string, element: HTMLElement) {
  // Clean up existing observer
  const existing = domObservers.current.get(nodeId);
  if (existing) {
    existing.destroy();
  }
  
  // Create new observer
  const observer = new DOMObserver({
    element,
    onMutationsBatched: (mutations) => {
      console.log(`[DOMObserver] Mutations for ${nodeId}:`, mutations.length);
    },
  });
  
  domObservers.current.set(nodeId, observer);
  
  // DON'T start yet - that's Phase 2
  console.log(`[DOMObserver] Initialized for ${nodeId}`);
}
```

**Add cleanup on unmount:**

```typescript
useEffect(() => {
  return () => {
    // Cleanup all observers
    domObservers.current.forEach(observer => observer.destroy());
    domObservers.current.clear();
  };
}, []);
```

**Verification:**
- [ ] Component compiles
- [ ] No runtime errors
- [ ] Console logs show observer initialization
- [ ] Observers are cleaned up on unmount
- [ ] Old typing system still works (no regression)

#### Step 1.3: Add extractSegmentsFromDOM Calls (Passive)

**Goal:** Call `extractSegmentsFromDOM` alongside `handleSegmentedInput` to verify it produces same results

**In NodeEditor.tsx, find ALL calls to `handleSegmentedInput`:**

```bash
rg "handleSegmentedInput" apps/engine-demo/src/NodeEditor.tsx -A 5
```

**For EACH call, add comparison:**

```typescript
// OLD WAY (keep this)
const oldSegments = handleSegmentedInput(node, cursor, element);

// NEW WAY (add this)
const newSegments = extractSegmentsFromDOM(element);

// COMPARE
const match = JSON.stringify(oldSegments.node.segments) === JSON.stringify(newSegments);
console.log(`[Comparison] Segments match: ${match}`);
if (!match) {
  console.error('[Comparison] MISMATCH:', {
    old: oldSegments.node.segments,
    new: newSegments,
  });
}

// Still use old way for now
setPendingSegments(nodeId, oldSegments.node.segments);
```

**Verification:**
- [ ] Type a-z in node - verify segments match
- [ ] Type with inline refs - verify segments match
- [ ] Type multiple paragraphs - verify segments match
- [ ] No mismatches in console
- [ ] If mismatches found, FIX `extractSegmentsFromDOM` before proceeding

---

### PHASE 2: SWITCH (Gradually)

**Goal:** Switch from TypingBuffer to MutationObserver one operation at a time

#### Step 2.1: Switch Blur Event

**Why blur first?** Lowest risk - simple case, no structural changes

**Find blur handler:**

```bash
rg "onBlur|handleBlur" apps/engine-demo/src/NodeEditor.tsx
```

**Current blur logic:**

```typescript
function handleBlur() {
  // Old way
  flushPendingSegments('blur');
  stopTyping();
}
```

**New blur logic:**

```typescript
function handleBlur(nodeId: string, element: HTMLElement) {
  console.log('[Blur] Using NEW MutationObserver path');
  
  // NEW: Extract from DOM
  const segments = extractSegmentsFromDOM(element);
  
  // Stop observer
  const observer = domObservers.current.get(nodeId);
  if (observer) {
    observer.stop();
    observer.clearPendingMutations();
  }
  
  // Update model directly
  const node = editorModelIndex.nodes.find(n => n.id === nodeId);
  if (node) {
    node.segments = segments;
    commit('blur');
  }
  
  // OLD WAY (comment out but keep)
  // flushPendingSegments('blur');
  // stopTyping();
}
```

**Verification:**
- [ ] Type in node, click outside - segments saved correctly
- [ ] Type, blur, type again - no stale data
- [ ] Multiple nodes - each independent
- [ ] No errors in console
- [ ] OLD blur handler disabled (commented out)

#### Step 2.2: Switch Arrow Keys (Node Change)

**Find arrow key handlers:**

```bash
rg "(ArrowUp|ArrowDown)" apps/engine-demo/src/NodeEditor.tsx -B 5 -A 10
```

**Current logic:**

```typescript
if (e.key === 'ArrowUp') {
  flushPendingSegments('arrow-up');
  // move cursor
}
```

**New logic:**

```typescript
if (e.key === 'ArrowUp') {
  console.log('[ArrowUp] Using NEW MutationObserver path');
  
  // Stop observer on current node
  const currentObserver = domObservers.current.get(currentNodeId);
  if (currentObserver) {
    currentObserver.stop();
  }
  
  // Extract segments from current node
  const currentElement = document.querySelector(`[data-node-id="${currentNodeId}"]`);
  if (currentElement) {
    const segments = extractSegmentsFromDOM(currentElement as HTMLElement);
    const node = editorModelIndex.nodes.find(n => n.id === currentNodeId);
    if (node) {
      node.segments = segments;
      commit('arrow-up');
    }
  }
  
  // Move cursor (existing logic)
  // ...
  
  // Start observer on new node
  const newObserver = domObservers.current.get(newNodeId);
  if (newObserver) {
    newObserver.start();
  }
  
  // OLD WAY (commented out)
  // flushPendingSegments('arrow-up');
}
```

**Verification:**
- [ ] Type in node A, press ArrowDown - segments saved in A
- [ ] Type in node B - no data from node A
- [ ] Arrow up/down multiple times - each node independent
- [ ] No stale data
- [ ] No errors

#### Step 2.3: Switch Enter Key

**This is CRITICAL - most complex operation**

**Find Enter handler:**

```bash
rg "e\.key === 'Enter'" apps/engine-demo/src/NodeEditor.tsx -B 10 -A 50
```

**Current Enter logic:**

```typescript
if (e.key === 'Enter') {
  // 1. Flush typing buffer
  flushPendingSegments('enter');
  
  // 2. Sync DOM to get final cursor position
  const syncResult = handleSegmentedInput(activeNode, liveCursor, activeElement);
  
  // 3. Split node
  const [head, tail] = performGuaranteedSplit(activeNode, liveCursor);
  
  // 4. Update model
  editorModelIndex.nodes.splice(activeIndex, 1, head, tail);
  
  // 5. Set cursor
  setCursor({ index: activeIndex + 1, segmentIndex: 0, offset: 0 });
}
```

**New Enter logic (STRICT ORDER):**

```typescript
if (e.key === 'Enter') {
  e.preventDefault();
  
  console.log('[Enter] Using NEW MutationObserver path');
  
  withStructuralCommit(() => {
    // STEP 1: Stop observer
    const observer = domObservers.current.get(liveCursor.nodeId);
    if (observer) {
      observer.stop();
      console.log('[Enter] Observer stopped');
    }
    
    // STEP 2: Get fresh segments from DOM
    const element = document.querySelector(`[data-node-id="${liveCursor.nodeId}"]`);
    if (!element) {
      console.error('[Enter] Element not found!');
      return;
    }
    
    const freshSegments = extractSegmentsFromDOM(element as HTMLElement);
    console.log('[Enter] Fresh segments:', freshSegments);
    
    // STEP 3: Update node with fresh segments
    const activeNode = editorModelIndex.nodes[activeIndex];
    activeNode.segments = freshSegments;
    
    // STEP 4: Get CURRENT cursor from DOM (NOT from state)
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      console.error('[Enter] No selection!');
      return;
    }
    
    const domCursor = mapDOMSelectionToCursor(selection, liveCursor.nodeId);
    console.log('[Enter] DOM cursor:', domCursor);
    
    // STEP 5: Split with fresh data
    const [head, tail] = performGuaranteedSplit(activeNode, domCursor);
    console.log('[Enter] Split result:', { head, tail });
    
    // STEP 6: Update model (index-based)
    editorModelIndex.nodes.splice(activeIndex, 1, head, tail);
    
    // STEP 7: Commit
    commit('enter');
    
    // STEP 8: Set cursor
    setCursor({ index: activeIndex + 1, segmentIndex: 0, offset: 0 });
    
    // STEP 9: Restart observer on new node
    requestAnimationFrame(() => {
      const newElement = document.querySelector(`[data-node-id="${tail.id}"]`);
      if (newElement) {
        initializeDOMObserver(tail.id, newElement as HTMLElement);
        const newObserver = domObservers.current.get(tail.id);
        if (newObserver) {
          newObserver.start();
          console.log('[Enter] Observer restarted on new node');
        }
      }
    });
  });
  
  // OLD WAY (commented out)
  // flushPendingSegments('enter');
  // const syncResult = handleSegmentedInput(...);
  // ...
}
```

**Verification Checklist (EXHAUSTIVE):**

**Basic Cases:**
- [ ] Empty node + Enter → creates empty node below
- [ ] "Hello|" + Enter → "Hello" above, "" below, cursor at start of ""
- [ ] "|Hello" + Enter → "" above, "Hello" below, cursor at start of "Hello"
- [ ] "Hel|lo" + Enter → "Hel" above, "lo" below, cursor at start of "lo"

**With Inline Elements:**
- [ ] "Hello @ref|" + Enter → splits correctly
- [ ] "Hello| @ref" + Enter → splits correctly
- [ ] "Hello @ref| world" + Enter → splits correctly
- [ ] "|@ref Hello" + Enter → splits correctly
- [ ] "Hello @ref1| @ref2" + Enter → splits correctly

**Multiple Operations:**
- [ ] Type, Enter, type, Enter, type → all correct
- [ ] Enter 10 times → 10 empty nodes created
- [ ] Type across multiple nodes, Enter in each → all independent

**Edge Cases:**
- [ ] Enter at very long line (1000 chars) → no lag
- [ ] Enter with composition (Chinese/Japanese input) → correct
- [ ] Enter with selection (text selected) → deletes selection first

**Regression Tests:**
- [ ] All previous Enter bugs fixed → no regressions
- [ ] No "zombie segments"
- [ ] No stale data
- [ ] No cursor jumps
- [ ] No empty segments

#### Step 2.4: Switch Backspace (Merge)

**This is SECOND most complex - handles node merging**

**Find Backspace handler:**

```bash
rg "e\.key === 'Backspace'" apps/engine-demo/src/NodeEditor.tsx -B 10 -A 50
```

**Current Backspace logic:**

```typescript
if (e.key === 'Backspace' && atStartOfNode) {
  // Merge with previous node
  flushPendingSegments('backspace-merge');
  // ... merge logic
}
```

**New Backspace logic:**

```typescript
if (e.key === 'Backspace' && atStartOfNode) {
  e.preventDefault();
  
  console.log('[Backspace] Using NEW MutationObserver path');
  
  withStructuralCommit(() => {
    // STEP 1: Stop both observers
    const currentObserver = domObservers.current.get(currentNodeId);
    const prevObserver = domObservers.current.get(prevNodeId);
    
    if (currentObserver) {
      currentObserver.stop();
      console.log('[Backspace] Current observer stopped');
    }
    if (prevObserver) {
      prevObserver.stop();
      console.log('[Backspace] Prev observer stopped');
    }
    
    // STEP 2: Extract fresh segments from BOTH nodes
    const currentElement = document.querySelector(`[data-node-id="${currentNodeId}"]`);
    const prevElement = document.querySelector(`[data-node-id="${prevNodeId}"]`);
    
    if (!currentElement || !prevElement) {
      console.error('[Backspace] Elements not found!');
      return;
    }
    
    const currentSegments = extractSegmentsFromDOM(currentElement as HTMLElement);
    const prevSegments = extractSegmentsFromDOM(prevElement as HTMLElement);
    
    console.log('[Backspace] Fresh segments:', {
      current: currentSegments,
      prev: prevSegments,
    });
    
    // STEP 3: Update nodes with fresh segments
    const currentNode = editorModelIndex.nodes[currentIndex];
    const prevNode = editorModelIndex.nodes[prevIndex];
    
    currentNode.segments = currentSegments;
    prevNode.segments = prevSegments;
    
    // STEP 4: Merge segments
    const mergedSegments = [...prevSegments, ...currentSegments];
    const cursorOffset = prevSegments.reduce((sum, seg) => 
      sum + (seg.type === 'text' ? seg.text.length : 1), 0
    );
    
    console.log('[Backspace] Merged segments:', mergedSegments);
    console.log('[Backspace] Cursor offset:', cursorOffset);
    
    // STEP 5: Update model (delete current, update prev)
    prevNode.segments = mergedSegments;
    editorModelIndex.nodes.splice(currentIndex, 1);
    
    // STEP 6: Commit
    commit('backspace-merge');
    
    // STEP 7: Set cursor
    setCursor({
      index: prevIndex,
      segmentIndex: prevSegments.length - 1,
      offset: cursorOffset,
    });
    
    // STEP 8: Restart observer on merged node
    requestAnimationFrame(() => {
      const mergedElement = document.querySelector(`[data-node-id="${prevNodeId}"]`);
      if (mergedElement) {
        const observer = domObservers.current.get(prevNodeId);
        if (observer) {
          observer.start();
          console.log('[Backspace] Observer restarted on merged node');
        }
      }
    });
  });
  
  // OLD WAY (commented out)
  // flushPendingSegments('backspace-merge');
  // ...
}
```

**Verification Checklist:**

**Basic Cases:**
- [ ] Two nodes, backspace at start of second → merges correctly
- [ ] Three nodes, backspace in middle → merges correctly
- [ ] Backspace at start of first node → does nothing

**With Content:**
- [ ] "Hello" + "World" → backspace → "HelloWorld"
- [ ] "Hello @ref" + "World" → backspace → "Hello @refWorld"
- [ ] "@ref" + "Hello" → backspace → "@refHello"

**Cursor Position:**
- [ ] After merge, cursor at junction → correct offset
- [ ] After merge, can type → inserts at right place
- [ ] After merge, can split again → splits correctly

**Multiple Merges:**
- [ ] Create 5 nodes, backspace 4 times → all merge correctly
- [ ] Create nodes, split with Enter, merge with Backspace → reversible

**Edge Cases:**
- [ ] Merge very long nodes (1000+ chars) → no lag
- [ ] Merge with inline elements at boundary → correct
- [ ] Merge empty nodes → correct

---

### PHASE 3: REMOVE (Delete Old Code)

**Goal:** Delete TypingBuffer and all related code

#### Step 3.1: Delete TypingBuffer Methods

**Only after PHASE 2 is 100% verified:**

**Files to modify:**

1. `apps/engine-demo/src/editor/TypingBuffer.ts`
   - [ ] Delete `setPendingSegments`
   - [ ] Delete `getPendingSegments`
   - [ ] Delete `flushPendingSegments`
   - [ ] Delete `clearPendingSegments`
   - [ ] Delete `startTyping`
   - [ ] Delete `stopTyping`
   - [ ] Delete `isTyping`
   - [ ] Keep file if other utilities exist, else delete entire file

2. `apps/engine-demo/src/NodeEditor.tsx`
   - [ ] Remove all TypingBuffer imports
   - [ ] Remove all `typingBuffer.` calls
   - [ ] Remove all `flushPendingSegments` calls
   - [ ] Remove all `isTyping()` checks
   - [ ] Remove all `startTyping()` calls
   - [ ] Remove all `stopTyping()` calls
   - [ ] Delete commented-out old code

3. `apps/engine-demo/src/editor/SegmentedEditor.ts`
   - [ ] Delete `handleSegmentedInput` (replaced by `extractSegmentsFromDOM`)
   - [ ] Keep other utilities if still needed

**Verification:**
- [ ] Run search: `rg "typingBuffer" --type ts` → zero results
- [ ] Run search: `rg "isTyping\(\)" --type ts` → zero results
- [ ] Run search: `rg "flushPendingSegments" --type ts` → zero results
- [ ] App compiles
- [ ] All operations still work
- [ ] No errors in console

#### Step 3.2: Delete handleSegmentedInput

**File:** `apps/engine-demo/src/editor/SegmentedEditor.ts`

**Search for all usages:**

```bash
rg "handleSegmentedInput" --type ts
```

**Expected:** Zero results (all replaced in Phase 2)

**If any remain:**
- [ ] Identify where it's used
- [ ] Replace with `extractSegmentsFromDOM`
- [ ] Test that operation
- [ ] Delete function

**Verification:**
- [ ] `handleSegmentedInput` function deleted
- [ ] No imports of it
- [ ] App compiles
- [ ] All operations work

#### Step 3.3: Remove isTyping Guards

**Search for remaining guards:**

```bash
rg "if.*isTyping" --type ts
```

**For each occurrence:**
- [ ] Understand what it's guarding
- [ ] Delete the guard (MutationObserver makes it unnecessary)
- [ ] Test that operation still works

**Common guards to remove:**
- `if (isTyping()) throw new Error(...)` in commit
- `if (isTyping()) return` in render
- `if (!isTyping()) startTyping()` in handlers

**Verification:**
- [ ] No `isTyping()` calls remain
- [ ] Commit doesn't throw "called during typing"
- [ ] All operations work

---

### PHASE 4: VERIFY (Exhaustive Testing)

**Goal:** Prove the refactor is complete and correct

#### Step 4.1: Automated Tests

**If tests exist:**
- [ ] Run all existing tests → all pass
- [ ] No new test failures

**If no tests exist:**
- [ ] Consider adding basic tests (optional, but recommended)
- [ ] At minimum: manual test checklist

#### Step 4.2: Manual Test Checklist

**MUST TEST EVERY SINGLE OPERATION:**

**Typing:**
- [ ] Type a-z in node → correct
- [ ] Type numbers 0-9 → correct
- [ ] Type special chars !@#$%^&*() → correct
- [ ] Type Unicode ñ, é, ü → correct
- [ ] Type emoji 😀🎉 → correct
- [ ] Type very fast (spam keyboard) → no lag, no errors

**Enter Key:**
- [ ] Empty node + Enter → new empty node below
- [ ] Start of node + Enter → empty above, content below
- [ ] Middle of node + Enter → splits correctly
- [ ] End of node + Enter → content above, empty below
- [ ] With inline ref before cursor → splits correctly
- [ ] With inline ref after cursor → splits correctly
- [ ] Multiple Enters rapidly → all correct

**Backspace Key:**
- [ ] Middle of text + Backspace → deletes char
- [ ] Start of node (not first) + Backspace → merges with above
- [ ] Start of first node + Backspace → does nothing
- [ ] Empty node + Backspace → deletes node
- [ ] Multiple Backspaces rapidly → all correct

**Arrow Keys:**
- [ ] ArrowUp → moves to node above
- [ ] ArrowDown → moves to node below
- [ ] ArrowLeft at start → moves to previous node end
- [ ] ArrowRight at end → moves to next node start
- [ ] Changes don't lose data → each node independent

**Tab/Shift+Tab:**
- [ ] Tab → indents node
- [ ] Shift+Tab → outdents node
- [ ] No data loss

**Cut/Copy/Paste:**
- [ ] Cut text → removes and copies
- [ ] Copy text → copies without removing
- [ ] Paste text → inserts at cursor
- [ ] Paste HTML → converts correctly
- [ ] Copy/paste inline refs → preserves structure

**Selection:**
- [ ] Select all text → correct
- [ ] Select across inline refs → correct
- [ ] Delete selection → removes correctly
- [ ] Type over selection → replaces correctly

**Focus/Blur:**
- [ ] Click into node → focus, start typing
- [ ] Click outside → blur, saves changes
- [ ] Click between nodes → saves old, loads new
- [ ] Blur then focus same node → no data loss

**Multiple Nodes:**
- [ ] Type in node A, switch to node B → A saved
- [ ] Type in B, switch to C → B saved
- [ ] Switch back to A → A still correct
- [ ] No cross-contamination between nodes

**Edge Cases:**
- [ ] Very long text (1000+ chars) → no lag
- [ ] Many nodes (100+) → no lag
- [ ] Rapid operations → no race conditions
- [ ] Browser back/forward → state preserved (if applicable)
- [ ] Page refresh → state preserved (if persistence exists)

**Regression Tests:**
- [ ] All bugs from KNOWN-BUGS-BEFORE.md are fixed
- [ ] No old bugs reappear
- [ ] No new bugs introduced

#### Step 4.3: Performance Test

**Measure and compare:**

**Typing Speed:**
- [ ] Before: Time to type 100 chars
- [ ] After: Time to type 100 chars
- [ ] After should be same or faster

**Enter Key Speed:**
- [ ] Before: Time for 10 consecutive Enters
- [ ] After: Time for 10 consecutive Enters
- [ ] After should be same or faster

**Memory Usage:**
- [ ] Before: Heap size after 100 operations
- [ ] After: Heap size after 100 operations
- [ ] After should be same or less

**If performance degrades:**
- [ ] Profile with Chrome DevTools
- [ ] Identify bottleneck
- [ ] Optimize before proceeding

#### Step 4.4: Code Quality Check

- [ ] No TypeScript errors
- [ ] No ESLint warnings (if configured)
- [ ] No `console.log` in production code (or use proper logger)
- [ ] No commented-out code
- [ ] No TODOs or FIXMEs without issues filed
- [ ] Code follows project style
- [ ] Functions have clear names
- [ ] Complex logic has comments

---

### PHASE 5: DOCUMENT (Critical for Future)

**Goal:** Prevent "we forgot this" in future

#### Step 5.1: Update Architecture Docs

**Create/Update:** `EDITOR-ARCHITECTURE.md`

**Document:**
- [ ] Data flow diagram (DOM → Observer → Model)
- [ ] Commit boundaries (where DOM is extracted)
- [ ] DOMObserver lifecycle (when it starts/stops)
- [ ] How to add new operations (template)
- [ ] Common pitfalls (what NOT to do)

#### Step 5.2: Create Migration Guide

**Create:** `MUTATION-OBSERVER-MIGRATION.md`

**Document:**
- [ ] What changed and why
- [ ] Before/after code examples
- [ ] How to add new keyboard handlers
- [ ] How to add new commit boundaries
- [ ] Troubleshooting guide

#### Step 5.3: Update Comments in Code

**In DOMObserver.ts:**
- [ ] Add JSDoc comments to all exported functions
- [ ] Explain when to use `extractSegmentsFromDOM`
- [ ] Document mutation batching behavior

**In NodeEditor.tsx:**
- [ ] Comment each commit boundary with "// COMMIT BOUNDARY: Enter"
- [ ] Explain observer lifecycle in comments
- [ ] Document why observer is stopped/started at each point

#### Step 5.4: Create Test Documentation

**Create:** `TESTING-GUIDE.md`

**Document:**
- [ ] Manual test checklist (copy from Step 4.2)
- [ ] How to verify a change doesn't break editor
- [ ] Performance benchmarks
- [ ] Common failure modes and how to detect them

---

## 🚨 ROLLBACK PROCEDURES

### If Something Goes Wrong

**At any step, if tests fail:**

1. **STOP IMMEDIATELY** - Don't proceed
2. **Document the failure** - What broke? How to reproduce?
3. **Decide:** Fix forward or rollback?

**To rollback:**

```bash
# Rollback last commit
git reset --hard HEAD~1

# Or rollback to checkpoint
git reset --hard backup-before-mutation-observer

# Verify rollback worked
npm run dev
# Test all operations manually
```

**After rollback:**
- [ ] Document why rollback was needed
- [ ] Identify what was missed in planning
- [ ] Update this plan with new knowledge
- [ ] Try again with updated plan

---

## 📊 SUCCESS CRITERIA

**The refactor is DONE when ALL of these are true:**

### Code Criteria
- [ ] ✅ No imports of `TypingBuffer` in codebase
- [ ] ✅ No calls to `isTyping()` in codebase
- [ ] ✅ No calls to `flushPendingSegments` in codebase
- [ ] ✅ No calls to `handleSegmentedInput` in codebase
- [ ] ✅ `DOMObserver` is used for all typing
- [ ] ✅ `extractSegmentsFromDOM` is used at all commit boundaries
- [ ] ✅ No TypeScript errors
- [ ] ✅ No console errors during operations

### Functional Criteria
- [ ] ✅ All manual tests pass (Step 4.2)
- [ ] ✅ No "zombie segments"
- [ ] ✅ No stale data between nodes
- [ ] ✅ No cursor jumps
- [ ] ✅ Enter key works perfectly in all cases
- [ ] ✅ Backspace merge works perfectly in all cases
- [ ] ✅ Typing is smooth and responsive
- [ ] ✅ All previous bugs fixed

### Performance Criteria
- [ ] ✅ Typing speed same or better
- [ ] ✅ Enter speed same or better
- [ ] ✅ Memory usage same or less
- [ ] ✅ No lag with 100+ nodes

### Documentation Criteria
- [ ] ✅ Architecture documented
- [ ] ✅ Migration guide created
- [ ] ✅ Code commented
- [ ] ✅ Testing guide created

---

## 📅 TIMELINE ESTIMATE

**IF everything goes smoothly:**

- Phase 0 (Analysis): 2 hours
- Phase 1 (Add): 3 hours
- Phase 2 (Switch): 6 hours
- Phase 3 (Remove): 1 hour
- Phase 4 (Verify): 4 hours
- Phase 5 (Document): 2 hours

**Total: 18 hours** (conservative estimate)

**IF issues are found:**
- Add 2-4 hours per issue for debugging/fixing
- Realistically: 20-25 hours

---

## 🎯 COMMITMENT

**ZERO TOLERANCE for:**
- ❌ "Old logic is clashing" - we mapped all dependencies
- ❌ "We missed this" - we have exhaustive checklists
- ❌ "It works but..." - it must work perfectly
- ❌ "We can fix later" - fix now or don't proceed
- ❌ Proceeding with failing tests
- ❌ Skipping verification steps
- ❌ Deleting code before replacement is proven

**REQUIRED for success:**
- ✅ Follow steps in exact order
- ✅ Verify after each step
- ✅ Test exhaustively
- ✅ Document as you go
- ✅ Rollback if uncertain
- ✅ No shortcuts

---

## 🚀 READY TO START?

**Pre-flight checklist:**
- [ ] Read entire plan (don't skim)
- [ ] Understand each phase
- [ ] Have time allocated (don't rush)
- [ ] Git repo is clean
- [ ] Backup created
- [ ] Terminal ready for commands
- [ ] Browser DevTools open
- [ ] Ready to test manually

**When all checked, proceed to Phase 0.**

**NO EXCUSES. NO SURPRISES.**
