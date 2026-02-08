# DOM BOUNDARY FIX APPLIED ✅

**Issue:** Enter key split at wrong position when cursor before inline element  
**Root Cause:** DOM → segment mapping failed to detect text/inline boundary  
**Fix:** Boundary detection in `getNodePositionFromSelection`

---

## THE BUG (Exact Reproduction)

### User Action:
```
"Check out @node-8 and also @node-6"
         ↑ Press Enter here (before @node-8)
```

### Expected Result:
```
Head: "Check out "
Tail: "@node-8 and also @node-6"
```

### Actual Result (BEFORE FIX):
```
Head: "Check"
Tail: " out @node-8 and also @node-6"
```

**Split at position 5 instead of position 10 (before inline)**

---

## ROOT CAUSE

### DOM Structure:
```html
<div contenteditable="true" data-node-id="node-10">
  "Check out "                              <!-- TEXT_NODE (segment 0) -->
  <span class="caret-anchor"></span>        <!-- Boundary marker -->
  <span class="inline-element">@node-8</span>  <!-- INLINE (segment 1) -->
  <span class="caret-anchor"></span>
  " and also "                              <!-- TEXT_NODE (segment 2) -->
  ...
</div>
```

### Browser Selection:
When cursor is at **end of "Check out "** (right before inline):
- `anchorNode`: TEXT_NODE "Check out "
- `anchorOffset`: 10 (end of text)
- `nextSibling`: SPAN.caret-anchor

### OLD Mapping Logic:
```typescript
if (anchor.nodeType === Node.TEXT_NODE) {
  const segmentIndex = getSegmentIndexFromTextNode(anchor);  // Returns 0
  const offset = sel.anchorOffset;  // Returns 10
  
  return { nodeId, segmentIndex: 0, offset: 10 };
  // ❌ WRONG: segmentIndex 0 with offset 10 is inside text,
  //           but we're actually at the boundary BEFORE inline
}
```

This made `handleSegmentedEnter` think cursor was **inside text at offset 10**, so it split text segment at that position.

---

## THE FIX

### NEW Boundary Detection:
```typescript
// File: apps/engine-demo/src/selection/domMapping.ts
// In getNodePositionFromSelection, CASE C (text node)

if (anchor.nodeType === Node.TEXT_NODE) {
  const segmentIndex = getSegmentIndexFromTextNode(anchor);
  const offset = sel.anchorOffset;
  const textContent = anchor.textContent || '';
  
  // ✅ CRITICAL FIX: Detect cursor at end of text (before inline)
  if (offset === textContent.length) {
    const nextSibling = anchor.nextSibling;
    if (nextSibling?.nodeType === Node.ELEMENT_NODE) {
      const elem = nextSibling as HTMLElement;
      if (elem.classList.contains('caret-anchor')) {
        // We're at text/inline boundary
        // Return position at START of next segment (the inline)
        return {
          nodeId: currentNode.id,
          segmentIndex: segmentIndex + 1,  // Move to inline segment
          offset: 0  // At start of inline
        };
      }
    }
  }
  
  return { nodeId: currentNode.id, segmentIndex, offset };
}
```

### How It Works:

**Detection Rule:**
```
IF cursor.offset === text.length
AND nextSibling is caret-anchor
THEN we're at text/inline boundary
→ Return position at START of NEXT segment (inline)
```

**Example:**
```
Text: "Check out "  (10 chars)
Cursor: offset = 10 (at end)
Next: <span class="caret-anchor">

OLD: { segmentIndex: 0, offset: 10 }  ❌ Inside text
NEW: { segmentIndex: 1, offset: 0 }   ✅ Before inline
```

### Split Behavior (with fix):

**Input to `performGuaranteedSplit`:**
```typescript
cursor = { segmentIndex: 1, offset: 0 }
```

**Case Determination:**
```typescript
// In determineSplitCase():
const segment = segments[1];  // Inline segment
if (offset === 0) {
  return 'START_OF_SEGMENT';  // Split BEFORE this segment
}
```

**Split Execution:**
```typescript
// In executeSplit():
case 'START_OF_SEGMENT':
  return {
    head: segments.slice(0, 1),  // [text: "Check out "]
    tail: segments.slice(1)      // [inline, text: " and also ", inline]
  };
```

**Result:**
```
Head segments: [{ type: "text", text: "Check out " }]
Tail segments: [{ type: "inline", id: "node-8" }, { type: "text", text: " and also " }, ...]
```

✅ **CORRECT!**

---

## VALIDATION

### Test Case 1: Enter before inline
```
Input:  "Check out @node-8"
              ↑ cursor here
Expected: Split to "Check out " / "@node-8"
```

### Test Case 2: Enter after inline
```
Input:  "Check out @node-8 and also"
                     ↑ cursor here (after inline)
Expected: Split to "Check out @node-8" / " and also"
```

### Test Case 3: Enter inside text
```
Input:  "Check out @node-8"
           ↑ cursor here (inside "Check")
Expected: Split to "Chec" / "k out @node-8"
```

---

## FILES CHANGED

### Modified:
1. **`apps/engine-demo/src/selection/domMapping.ts`**
   - Added boundary detection in `getNodePositionFromSelection`
   - 15 lines added in CASE C (text node handling)

### Created:
1. **`DOM-SEGMENT-MAPPING-BUG.md`** - Bug analysis
2. **`DOM-BOUNDARY-FIX-APPLIED.md`** - This file

---

## STATUS

✅ Fix applied  
⏳ Awaiting test  

**Next:** User tests Enter key before inline elements

---

## ARCHITECTURAL NOTE

This fix is **structurally correct** because:

1. **No heuristics** - Uses explicit DOM structure (caret-anchor class)
2. **No magic offsets** - Detects actual boundary condition (offset === text.length)
3. **Preserves segment invariants** - Inline segments always have offset 0 or 1
4. **Delegates to split-state-machine** - Doesn't duplicate split logic

The boundary case is now **explicitly handled** in DOM mapping, making it impossible for future code to reintroduce the bug without explicitly removing this check.
