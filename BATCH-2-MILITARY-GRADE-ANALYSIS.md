# 🎖️ BATCH 2 - MILITARY-GRADE BUG ANALYSIS & FIX PLAN

**Date:** 2026-02-04  
**Phase:** Batch 2 (Enter + Backspace Handlers) - Testing  
**Status:** 🔴 CRITICAL BUGS IDENTIFIED - NO CODE CHANGES YET  
**Bugs Reported:** 4/4 ✅  
**Root Causes Identified:** 3 distinct failure modes  

---

## 📋 **EXECUTIVE SUMMARY**

### The Pattern:

**ALL 4 bugs involve inline elements (@ref2 specifically) and cursor positioning.**

This is NOT a coincidence. Our system has **3 distinct failure modes** in how it handles inline elements:

1. **Cursor calculation after merge** (Bugs #1, #2)
2. **DOM extraction after typing** (Bug #3)
3. **Cursor position reading from caret-anchors** (Bug #4)

### Impact Assessment:

| Severity | Bug | User Impact | Data Loss Risk |
|----------|-----|-------------|----------------|
| 🔴 CRITICAL | #3 | Text disappears | **YES - Data loss** |
| 🟠 HIGH | #4 | Empty nodes created | YES - Structural corruption |
| 🟡 MEDIUM | #1, #2 | Cursor in wrong position | NO - Annoying but safe |

**Bottom Line:** Bugs #3 and #4 cause data loss. **Must be fixed before shipping Batch 2.**

---

## 🐛 **BUG CATALOG**

### Bug #1: BACKSPACE - Cursor Before Inline After Enter-Backspace

**Scenario:**
```
Initial: "Some text here @ref1 then some text here @ref2"
                                                          ^ cursor at end
Press Enter:
  Node 1: "Some text here @ref1 then some text here @ref2"
  Node 2: "" (empty)
                                                          
Press Backspace (merge empty node back):
  Result: "Some text here @ref1 then some text here @ref2"
                                                   ^ cursor BEFORE @ref2 ❌
  Expected: cursor at END after @ref2 ✅
```

**Reproducibility:** 100% (Always happens)

---

### Bug #2: BACKSPACE - Cursor Before Inline After Content Merge

**Scenario:**
```
Initial:
  Node 1: "Some text here @ref1 then some text here @ref2"
  Node 2: "Some content in node 2" ^ cursor here
  
Press Backspace at start of Node 2 (merge):
  Result: "Some text here @ref1 then some text here @ref2Some content in node 2"
                                                   ^ cursor BEFORE @ref2 ❌
  Expected: cursor at junction (after @ref2) ✅
```

**Reproducibility:** 100% (Always happens)

---

### Bug #3: ENTER - Newly Typed Text Disappears (DATA LOSS!)

**Scenario:**
```
Initial: "Some text here @ref1 then some text here @ref2"
                                                          ^ cursor at end
Type text: " added some additional text here"
  
DOM shows: "Some text here @ref1 then some text here @ref2 added some additional text here"
           ^ visible on screen, cursor at end
  
Press Enter (split anywhere):
  Result: "Some text here @ref1 then some text here @ref2"
          "" (new node)
  
  ❌ CRITICAL: " added some additional text here" DISAPPEARED!
```

**Critical Details:**
- Only happens when node contains inline elements
- Works fine for text-only nodes
- Text is visible on screen before Enter
- Text vanishes after split

**Reproducibility:** 100% (Always happens with inline elements)

---

### Bug #4: ENTER - Intermittent Empty Node Creation

**Scenario:**
```
Initial: "Check out @ref1 and also @ref2"
                                  ^ cursor BEFORE @ref2 (in caret-anchor)
  
Press Enter:
  Expected:
    Node 1: "Check out @ref1 and also "
    Node 2: "@ref2"
  
  Actual (sometimes):
    Node 1: "Check out @ref1 and also @ref2"
    Node 2: "" (empty)
  OR:
    Node 1: ""
    Node 2: "Check out @ref1 and also @ref2"
```

**Critical Details:**
- Cursor is in caret-anchor (zero-width span before inline)
- NOT reproducible every time (race condition)
- Frequency: ~10-20% of attempts

**Reproducibility:** Intermittent (Race condition)

---

## 🔬 **ROOT CAUSE ANALYSIS**

### ROOT CAUSE A: `mergeWithPrevious()` - Broken Cursor Calculation

**File:** `/apps/editor/src/editor/SegmentedEditor.ts:213-248`

**Current Implementation:**
```typescript
export function mergeWithPrevious(
  previous: Node,
  current: Node
): { merged: Node; cursor: CursorPosition } {
  const merged = mergeNodes(previous, current);

  // Cursor goes to junction point (end of previous node's original content)
  const previousSegmentCount = previous.segments.length;

  // Find last text segment in previous node
  let segmentIndex = previousSegmentCount - 1;
  let offset = 0;

  for (let i = previousSegmentCount - 1; i >= 0; i--) {
    const seg = previous.segments[i];
    if (seg && seg.type === 'text') {
      segmentIndex = i;
      offset = seg.text.length;
      break;
    }
  }

  // If no text segments in previous, cursor at start
  if (segmentIndex < 0) {
    segmentIndex = 0;
  }

  return {
    merged,
    cursor: {
      nodeId: merged.id,
      segmentIndex,
      offset,
    },
  };
}
```

**The Bug:**

When `previous.segments` ends with an inline element:

```
previous.segments = [
  { type: 'text', text: 'Some text here ' },
  { type: 'inline', id: 'ref1' },
  { type: 'text', text: ' then some text here ' },
  { type: 'inline', id: 'ref2' }  ← LAST SEGMENT
]
```

**Execution:**
1. Loop starts at `i = 3` (last segment)
2. `segments[3]` is inline → skip
3. `i = 2`: Found text segment → `segmentIndex = 2`, `offset = 21`
4. **Cursor placed at segment 2, offset 21**

**Result in merged node:**
```
merged.segments = [
  { type: 'text', text: 'Some text here ' },      // [0]
  { type: 'inline', id: 'ref1' },                 // [1]
  { type: 'text', text: ' then some text here ' },// [2] ← cursor here, offset 21
  { type: 'inline', id: 'ref2' },                 // [3]
  { type: 'text', text: 'Some content' }          // [4]
]
```

**Cursor position: segment[2], offset 21 = right BEFORE @ref2**

**Expected: segment[4], offset 0 (after @ref2, at junction)**

---

### THE FIX:

**Cursor should be AFTER the entire previous node content, at the junction.**

Use `findSegmentAtPlainTextOffset()` to convert:
- Plain text offset = `getPlainText(previous.segments).length`
- To segment position accounting for inline elements

**Corrected Implementation:**

```typescript
export function mergeWithPrevious(
  previous: Node,
  current: Node
): { merged: Node; cursor: CursorPosition } {
  const merged = mergeNodes(previous, current);

  // Cursor at junction = end of previous content
  const plainTextOffset = getPlainText(previous.segments).length;
  const cursorPosition = findSegmentAtPlainTextOffset(
    merged.segments,
    plainTextOffset
  );

  return {
    merged,
    cursor: {
      nodeId: merged.id,
      segmentIndex: cursorPosition.segmentIndex,
      offset: cursorPosition.offset,
    },
  };
}
```

**Impact:** Fixes Bugs #1 and #2 ✅

---

### ROOT CAUSE B: `extractSegmentsFromDOM()` - Missing Text After Last Inline

**File:** `/apps/editor/src/editor/DOMObserver.ts:294-412`

**Current Implementation:**

```typescript
export function extractSegmentsFromDOM(element: HTMLElement): Segment[] {
  const segments: Segment[] = [];

  // Walk direct children only (not recursive - structure is flat)
  for (const child of Array.from(element.childNodes)) {
    // Text nodes
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        // Merge with previous text segment if exists
        const lastSegment = segments[segments.length - 1];
        if (lastSegment && lastSegment.type === 'text') {
          lastSegment.text += text;
        } else {
          segments.push({ type: 'text', text });
        }
      }
      continue;
    }

    // Element nodes
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;

      // Inline elements (@refs, #tags)
      if (el.classList.contains('inline-element')) {
        const inlineId = el.getAttribute('data-inline-id');
        if (!inlineId) {
          console.warn('[extractSegmentsFromDOM] Inline element missing data-inline-id', el);
          continue;
        }

        segments.push({
          type: 'inline',
          kind: 'ref',
          id: inlineId,
          payload: { type: 'reference', targetId: inlineId },
        });
        continue;
      }

      // Caret anchors (zero-width spans for cursor placement)
      if (el.classList.contains('caret-anchor')) {
        // Ignore - these are rendering artifacts, not content
        continue;
      }

      // Unknown elements - extract text content as fallback
      const text = el.textContent || '';
      if (text) {
        console.warn('[extractSegmentsFromDOM] Unknown element, extracting text', el);
        segments.push({ type: 'text', text });
      }
    }
  }

  return segments;
}
```

**The Bug:**

**This code looks correct at first glance!** It should iterate through ALL childNodes.

**Hypothesis:** The bug is NOT in `extractSegmentsFromDOM()` itself.

**Real Problem:** Text is never committed to the DOM before Enter is pressed.

**Explanation:**

1. User types " added some additional text here"
2. Browser inserts text into contenteditable DOM
3. **MutationObserver should capture this** → but might not be running?
4. User presses Enter
5. `handleSegmentedEnter()` called
6. Calls `extractSegmentsFromDOM()`
7. **DOM contains the typed text** (visible on screen)
8. BUT: Maybe extraction happens on **stale DOM node**?

**Alternative Hypothesis:**

The text IS extracted correctly, but:
- Split happens at wrong position
- Text ends up in wrong half of the split
- Then gets lost during node replacement

**Investigation Needed:**

1. Add debug logging to `extractSegmentsFromDOM()`:
   ```typescript
   console.log('[extractSegmentsFromDOM] childNodes:', Array.from(element.childNodes).map(n => ({
     type: n.nodeType === Node.TEXT_NODE ? 'TEXT' : 'ELEMENT',
     content: n.textContent,
     classList: (n as HTMLElement).classList
   })));
   ```

2. Check what `handleSegmentedEnter()` receives as `node.segments`

3. Check what `splitNodeAtCursor()` returns for head/tail

**Impact:** Causes Bug #3 (data loss) ❌

---

### ROOT CAUSE C: `getNodePositionFromSelection()` - Race Condition in Caret-Anchor

**File:** `/apps/editor/src/selection/domMapping.ts:42-113`

**Current Implementation:**

```typescript
export function getNodePositionFromSelection(
  currentNode: Node
): CursorPosition | null {
  const sel = window.getSelection();

  if (!sel || !sel.isCollapsed) {
    return null;
  }

  const anchor = sel.anchorNode;

  if (!anchor) {
    return null;
  }

  // CASE A: anchorNode IS a caret anchor
  if (
    anchor.nodeType === Node.ELEMENT_NODE &&
    (anchor as HTMLElement).classList.contains('caret-anchor')
  ) {
    // Cursor is at segment boundary
    const segmentIndex = getSegmentIndexFromCaretAnchor(anchor as HTMLElement);
    return { nodeId: currentNode.id, segmentIndex, offset: 0 };
  }

  // CASE B: anchorNode is INSIDE a caret anchor
  if (
    anchor.nodeType === Node.TEXT_NODE &&
    anchor.parentElement?.classList.contains('caret-anchor')
  ) {
    const segmentIndex = getSegmentIndexFromCaretAnchor(anchor.parentElement);
    return { nodeId: currentNode.id, segmentIndex, offset: 0 };
  }

  // ... other cases
}
```

**The Bug:**

**Timing Issue:** When Enter is pressed:

1. Selection might be read **mid-mutation**
2. DOM is being updated by previous operations
3. `anchorNode` might point to:
   - Old DOM node (removed from document)
   - Caret-anchor that's being replaced
   - Text node that's being split

4. `getSegmentIndexFromCaretAnchor()` might return:
   - Stale index
   - Wrong index if DOM changed
   - -1 or 0 (fallback)

**Why intermittent?**

Race condition depends on:
- Browser's contenteditable mutation timing
- requestAnimationFrame scheduling
- MutationObserver callback timing
- How fast user types

**Fast typing → higher chance of hitting race window**

**Alternative Hypothesis:**

Bug #4 might NOT be `getNodePositionFromSelection()` at all.

Could be:
- `extractSegmentsFromDOM()` reading partial state
- Split happening before observer processes mutations
- Cursor placement happening before DOM settles

**Investigation Needed:**

1. Add debug logging before Enter:
   ```typescript
   const sel = window.getSelection();
   console.log('[DEBUG] Enter pressed:', {
     anchorNode: sel?.anchorNode,
     anchorOffset: sel?.anchorOffset,
     isCaretAnchor: sel?.anchorNode?.parentElement?.classList.contains('caret-anchor'),
     computedPosition: getNodePositionFromSelection(node)
   });
   ```

2. Check observer state:
   ```typescript
   console.log('[DEBUG] Observer running?', observer.isRunning);
   console.log('[DEBUG] Pending mutations?', observer.hasPendingMutations);
   ```

3. Try adding `await` or synchronous DOM read before split

**Impact:** Causes Bug #4 (intermittent empty nodes) ❌

---

## 🎯 **FIX PLAN**

### Priority Classification:

| Priority | Bugs | Reason | Risk |
|----------|------|--------|------|
| P0 (CRITICAL) | #3 | Data loss | LOW - Clear fix |
| P1 (HIGH) | #1, #2 | User experience | LOW - Clear fix |
| P2 (MEDIUM) | #4 | Race condition | MEDIUM - Needs investigation |

---

### PHASE 1: Fix Critical Data Loss (Bug #3)

**Objective:** Prevent text from disappearing

**Steps:**

1. **Add Debug Logging:**
   ```typescript
   // In NodeEditor.tsx, before Enter handling
   console.log('[DEBUG-ENTER] Pre-extraction:', {
     domContent: contentElement.innerHTML,
     childNodes: Array.from(contentElement.childNodes).map(n => ({
       type: n.nodeType,
       content: n.textContent
     })),
     segments: node.segments
   });
   ```

2. **Verify extractSegmentsFromDOM():**
   - Confirm it captures all text nodes
   - Check if mutation observer is running
   - Verify DOM is stable before extraction

3. **Check Split Logic:**
   - Log `splitNodeAtCursor()` input and output
   - Verify head/tail segments contain all content
   - Check validation in `performGuaranteedSplit()`

4. **Likely Fix:**
   
   **Option A:** Force observer to commit before Enter
   ```typescript
   if (e.key === 'Enter') {
     // Force commit any pending mutations
     observer.flush();  // or observer.processNow()
     
     // NOW extract segments
     const segments = extractSegmentsFromDOM(contentElement);
     // ... rest of Enter logic
   }
   ```

   **Option B:** Read from DOM synchronously
   ```typescript
   if (e.key === 'Enter') {
     // Stop observer temporarily
     observer.stop();
     
     // Extract from current DOM state (guaranteed fresh)
     const segments = extractSegmentsFromDOM(contentElement);
     
     // Resume observer after structural change
     observer.start();
   }
   ```

5. **Test:**
   - Type text after inline element
   - Press Enter
   - Verify text appears in split nodes

**Estimated Time:** 30-60 minutes  
**Risk:** LOW (debugging + clear fix)

---

### PHASE 2: Fix Cursor Position (Bugs #1, #2)

**Objective:** Place cursor at correct position after merge

**Steps:**

1. **Import Utilities:**
   ```typescript
   import { getPlainText, findSegmentAtPlainTextOffset } from './engine/SegmentUtils';
   ```

2. **Update `mergeWithPrevious()`:**
   ```typescript
   export function mergeWithPrevious(
     previous: Node,
     current: Node
   ): { merged: Node; cursor: CursorPosition } {
     const merged = mergeNodes(previous, current);

     // Cursor at junction = end of previous content
     const plainTextOffset = getPlainText(previous.segments).length;
     const cursorPosition = findSegmentAtPlainTextOffset(
       merged.segments,
       plainTextOffset
     );

     return {
       merged,
       cursor: {
         nodeId: merged.id,
         segmentIndex: cursorPosition.segmentIndex,
         offset: cursorPosition.offset,
       },
     };
   }
   ```

3. **Add Tests:**
   ```typescript
   test('mergeWithPrevious - cursor after inline element', () => {
     const previous = {
       id: '1',
       segments: [
         { type: 'text', text: 'Hello ' },
         { type: 'inline', id: 'ref1' },
         { type: 'text', text: ' world' },
         { type: 'inline', id: 'ref2' }
       ]
     };
     
     const current = {
       id: '2',
       segments: [{ type: 'text', text: ' more text' }]
     };
     
     const result = mergeWithPrevious(previous, current);
     
     // Cursor should be AFTER @ref2, at " more text"
     expect(result.cursor.segmentIndex).toBe(4);
     expect(result.cursor.offset).toBe(0);
   });
   ```

4. **Manual Test:**
   - Node 1: "text @ref1 text @ref2"
   - Node 2: "content"
   - Backspace at start of Node 2
   - Verify cursor between @ref2 and "content"

**Estimated Time:** 15-30 minutes  
**Risk:** LOW (straightforward fix, utilities already exist)

---

### PHASE 3: Investigate Race Condition (Bug #4)

**Objective:** Understand and eliminate intermittent bug

**Steps:**

1. **Add Comprehensive Logging:**
   ```typescript
   if (e.key === 'Enter') {
     const sel = window.getSelection();
     const observerState = {
       isRunning: observer.isRunning,
       pendingMutations: observer.pendingMutations?.length || 0
     };
     
     console.log('[ENTER-DEBUG]', {
       timestamp: Date.now(),
       selection: {
         anchorNode: sel?.anchorNode?.nodeName,
         anchorOffset: sel?.anchorOffset,
         isCaretAnchor: sel?.anchorNode?.parentElement?.classList.contains('caret-anchor')
       },
       observerState,
       currentSegments: node.segments,
       domHTML: contentElement.innerHTML
     });
     
     // ... Enter handling
   }
   ```

2. **Try Synchronous Read:**
   ```typescript
   if (e.key === 'Enter') {
     // Option A: Flush observer
     if (observer.hasPending()) {
       observer.flushSync();
     }
     
     // Option B: Stop observer during critical section
     observer.pause();
     const cursor = getNodePositionFromSelection(node);
     const segments = extractSegmentsFromDOM(contentElement);
     observer.resume();
     
     // ... rest of logic
   }
   ```

3. **Test Timing:**
   - Try fast typing before Enter
   - Try slow typing before Enter
   - Check if bug frequency changes

4. **Possible Fixes:**

   **Fix A: Synchronous DOM Read**
   ```typescript
   // Always stop observer before reading cursor/segments
   observer.stop();
   const cursor = getNodePositionFromSelection(node);
   const segments = extractSegmentsFromDOM(element);
   observer.start();
   ```

   **Fix B: Use RAF to settle DOM**
   ```typescript
   if (e.key === 'Enter') {
     e.preventDefault();
     
     requestAnimationFrame(() => {
       // DOM has settled, safe to read
       const cursor = getNodePositionFromSelection(node);
       // ... Enter logic
     });
   }
   ```

   **Fix C: Validate Cursor Position**
   ```typescript
   const cursor = getNodePositionFromSelection(node);
   
   // Validate cursor is within bounds
   if (cursor.segmentIndex >= node.segments.length) {
     console.error('[CURSOR VALIDATION] Out of bounds, using safe fallback');
     cursor.segmentIndex = node.segments.length - 1;
     cursor.offset = 0;
   }
   ```

**Estimated Time:** 1-2 hours (investigation + fix)  
**Risk:** MEDIUM (race conditions are tricky)

---

## 🧪 **TEST PLAN**

### Unit Tests:

```typescript
describe('mergeWithPrevious - cursor positioning', () => {
  test('cursor after text segment', () => {
    const prev = createNode(['Hello world']);
    const curr = createNode(['More text']);
    const result = mergeWithPrevious(prev, curr);
    
    expect(result.cursor.segmentIndex).toBe(1);
    expect(result.cursor.offset).toBe(0);
  });
  
  test('cursor after inline element', () => {
    const prev = createNode(['Hello ', inline('ref1'), ' world ', inline('ref2')]);
    const curr = createNode(['More text']);
    const result = mergeWithPrevious(prev, curr);
    
    // Should be at start of "More text", after @ref2
    expect(result.cursor.segmentIndex).toBe(4);
    expect(result.cursor.offset).toBe(0);
  });
  
  test('cursor when previous node is only inlines', () => {
    const prev = createNode([inline('ref1'), inline('ref2')]);
    const curr = createNode(['Text']);
    const result = mergeWithPrevious(prev, curr);
    
    expect(result.cursor.segmentIndex).toBe(2);
    expect(result.cursor.offset).toBe(0);
  });
});

describe('extractSegmentsFromDOM', () => {
  test('extracts text after inline element', () => {
    const html = `
      <div contenteditable="true">
        Hello <span class="caret-anchor"></span>
        <span class="inline-element inline-ref" data-inline-id="ref1">@ref1</span>
        <span class="caret-anchor"></span>
         world
      </div>
    `;
    
    const element = createElementFromHTML(html);
    const segments = extractSegmentsFromDOM(element);
    
    expect(segments).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'inline', kind: 'ref', id: 'ref1', ... },
      { type: 'text', text: ' world' }
    ]);
  });
  
  test('extracts text added after last inline', () => {
    const html = `
      <div contenteditable="true">
        Text <span class="inline-element" data-inline-id="ref1">@ref1</span>
        <span class="caret-anchor"></span> newly typed text
      </div>
    `;
    
    const segments = extractSegmentsFromDOM(createElementFromHTML(html));
    
    const lastSegment = segments[segments.length - 1];
    expect(lastSegment.type).toBe('text');
    expect(lastSegment.text).toContain('newly typed text');
  });
});
```

### Manual Tests:

**Test Case #1: Backspace After Enter**
```
1. Type: "Hello @ref1 world @ref2"
2. Press Enter (at end)
3. Press Backspace
4. ✅ Cursor should be at end, after @ref2
```

**Test Case #2: Backspace Merge With Content**
```
1. Node 1: "Text @ref1 more @ref2"
2. Node 2: "Content here"
3. Backspace at start of Node 2
4. ✅ Cursor between @ref2 and "Content"
```

**Test Case #3: Type After Inline, Then Split**
```
1. Type: "Hello @ref1 world @ref2"
2. Type: " newly added text here"
3. Press Enter anywhere
4. ✅ "newly added text here" should be preserved in split
```

**Test Case #4: Enter Before Inline (Repeat 20 times)**
```
1. Type: "Hello @ref1 world @ref2"
2. Position cursor BEFORE @ref2
3. Press Enter
4. ✅ Should split cleanly every time (no empty nodes)
5. Repeat 20+ times to catch race condition
```

---

## 📊 **RISK ASSESSMENT**

### Fix Risks:

| Fix | Complexity | Risk | Mitigation |
|-----|------------|------|------------|
| Bug #3 | Medium | LOW | Debug logging + observer control |
| Bugs #1,#2 | Low | LOW | Clear algorithm + unit tests |
| Bug #4 | High | MEDIUM | Extensive logging + multiple approaches |

### Regression Risks:

| Area | Risk | Test Coverage |
|------|------|---------------|
| Text-only nodes | LOW | Already works |
| Single inline element | LOW | Clear cases |
| Multiple inline elements | MEDIUM | Add tests |
| Empty nodes | LOW | Existing tests |
| Arrow keys | NONE | Separate code path |
| Tab/Shift+Tab | NONE | Separate code path |

---

## ⏱️ **TIMELINE ESTIMATE**

| Phase | Duration | Risk |
|-------|----------|------|
| Phase 1 (Bug #3) | 30-60 min | LOW |
| Phase 2 (Bugs #1,#2) | 15-30 min | LOW |
| Phase 3 (Bug #4) | 1-2 hours | MEDIUM |
| Testing | 30 min | - |
| **TOTAL** | **2.5-4 hours** | **LOW-MEDIUM** |

---

## 🎯 **IMPLEMENTATION SEQUENCE**

### Step 1: Phase 1 (Critical Data Loss)
1. Add debug logging
2. Investigate `extractSegmentsFromDOM()`
3. Check observer state
4. Implement fix (observer flush or sync read)
5. Manual test: type after inline, press Enter
6. ✅ Confirm text is preserved

### Step 2: Phase 2 (Cursor Position)
1. Update `mergeWithPrevious()`
2. Add unit tests
3. Manual test: Backspace merge scenarios
4. ✅ Confirm cursor at junction

### Step 3: Phase 3 (Race Condition)
1. Add comprehensive logging
2. Reproduce bug consistently (if possible)
3. Try synchronous fixes
4. Test timing variations
5. ✅ Confirm stable behavior

### Step 4: Full Regression Testing
1. Run all keyboard handler tests
2. Test Tab/Shift+Tab (no regression)
3. Test Arrow keys (no regression)
4. Test Enter edge cases
5. Test Backspace edge cases
6. ✅ Confirm Batch 2 complete

---

## 📝 **COMMIT STRATEGY**

### Commit 1: Fix Bug #3 (Data Loss)
```
fix(editor): prevent text loss after inline elements on Enter

CRITICAL BUG: Newly typed text after inline elements disappeared when
pressing Enter. This was caused by [ROOT CAUSE TBD after investigation].

Fix: [APPROACH TBD]

Manual testing:
- Type text after @ref, press Enter → text preserved ✅
- Split at various positions → all content preserved ✅

Refs: BATCH-2-BUG-REPORT.md, Bug #3
```

### Commit 2: Fix Bugs #1, #2 (Cursor Position)
```
fix(editor): correct cursor position after merge with inline elements

When merging nodes ending with inline elements, cursor was positioned
BEFORE the last inline instead of at the junction point.

Root cause: mergeWithPrevious() used naive backward search for text
segments, ignoring inline elements that should be skipped over.

Fix: Use getPlainText() + findSegmentAtPlainTextOffset() to calculate
correct cursor position accounting for all inline elements.

Unit tests added:
- Cursor after inline element
- Cursor with multiple inlines
- Cursor with only inlines

Manual testing:
- Backspace merge after Enter → cursor at end ✅
- Backspace merge with content → cursor at junction ✅

Refs: BATCH-2-BUG-REPORT.md, Bugs #1, #2
```

### Commit 3: Fix Bug #4 (Race Condition)
```
fix(editor): eliminate race condition in Enter before inline elements

Intermittent bug where Enter before inline elements created empty nodes.

Root cause: [TBD after investigation - likely observer timing]

Fix: [APPROACH TBD - synchronous read or observer control]

Testing:
- Repeated Enter before inline 50+ times → stable ✅
- Fast typing + Enter → stable ✅

Refs: BATCH-2-BUG-REPORT.md, Bug #4
```

### Commit 4: Batch 2 Complete
```
feat(architecture): complete Batch 2 migration (Enter + Backspace)

Migration complete:
- Enter handler → pure function + old execution path
- Backspace handler → pure function + old execution path
- All bugs fixed (data loss, cursor positioning, race condition)
- Full test coverage

Handlers remain in temporary location during architecture migration.
Will be moved to EditorCoordinator in future phase.

Next: Batch 3 (Selection + Blur + Composition handlers)

Refs: MIGRATION-PLAN.md, BATCH-2-BUG-REPORT.md
```

---

## 🔒 **ARCHITECTURAL NOTES**

### Why These Bugs Happened:

1. **Naive Cursor Calculation:**
   - `mergeWithPrevious()` didn't use segment utilities
   - Treated inline elements as text boundaries
   - Should have used `findSegmentAtPlainTextOffset()`

2. **Observer Timing:**
   - Mutations might not commit before Enter
   - Race between typing and keyboard handler
   - Need synchronous DOM read or observer control

3. **Complexity at Boundaries:**
   - Inline elements create segment boundaries
   - Caret-anchors complicate cursor positioning
   - DOM structure vs logical structure mismatch

### Prevention for Future:

1. **Always use segment utilities:**
   - `getPlainText()` for plain text offset
   - `findSegmentAtPlainTextOffset()` for cursor position
   - Never manually iterate segments for cursor calc

2. **Control observer timing:**
   - Stop observer during critical sections
   - OR flush mutations before reading state
   - Never assume DOM is stable

3. **Validate all cursor positions:**
   - Check segmentIndex in bounds
   - Check offset in bounds
   - Use safe fallbacks

4. **Test inline element edge cases:**
   - Text before inline
   - Text after inline
   - Multiple inlines in a row
   - Node starting/ending with inline

---

## ✅ **SUCCESS CRITERIA**

### Before Starting Fixes:
- [ ] All 4 bugs documented
- [ ] Root causes hypothesized
- [ ] Fix plan approved

### After Phase 1:
- [ ] Bug #3 fixed (no data loss)
- [ ] Manual test: type after inline + Enter → text preserved
- [ ] Debug logs captured

### After Phase 2:
- [ ] Bugs #1, #2 fixed (cursor correct)
- [ ] Unit tests added
- [ ] Manual test: merge scenarios → cursor at junction

### After Phase 3:
- [ ] Bug #4 fixed (no intermittent failures)
- [ ] Manual test: 50+ Enter attempts → all stable

### Before Commit:
- [ ] All 4 bugs fixed
- [ ] No regressions (Tab, Arrows, existing Enter/Backspace)
- [ ] Test coverage complete
- [ ] Code reviewed
- [ ] Ready for manual UI testing

---

## 🎖️ **FINAL AUTHORIZATION**

This analysis is complete and ready for implementation.

**Awaiting user command:** "Proceed with fixes"

**DO NOT make code changes until authorized.**

---

**END OF MILITARY-GRADE ANALYSIS**
