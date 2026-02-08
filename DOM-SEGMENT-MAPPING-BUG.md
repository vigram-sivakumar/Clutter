# DOM → SEGMENT MAPPING IS BROKEN

**Issue:** Cursor before @node-8 maps to wrong segment position  
**Result:** Split happens at wrong location in text  
**Root cause:** `getSegmentIndexFromTextNode` counts wrong with caret-anchors

---

## THE BUG (Exact Trace)

### User Action:
- Click before "@node-8" in "Check out @node-8 and also @node-6"
- Press Enter

### Expected:
- Split BEFORE inline: "Check out " / "" + @node-8 + " and also " + @node-6
- Cursor at: segmentIndex: 1, offset: 0 (before inline)

### Actual (from logs):
- Selection: `{nodeId: 'node-10', segmentIndex: 1, offset: 4}`
- Split result: "Check" / " out " + @node-8 + ...
- **Split at position 5 in text, not at position 10 (before inline)**

---

## DOM STRUCTURE (From NodeView)

### Segments:
```javascript
[
  { type: "text", text: "Check out " },        // segment 0
  { type: "inline", kind: "ref", id: "node-8" }, // segment 1
  { type: "text", text: " and also " },        // segment 2
  { type: "inline", kind: "ref", id: "node-6" }  // segment 3
]
```

### DOM Rendering:
```html
<div class="node__content" contenteditable="true" data-node-id="node-10">
  "Check out "                              <!-- TEXT_NODE (segment 0) -->
  <span class="caret-anchor"></span>        <!-- Before inline -->
  <span class="inline-element">@node-8</span>  <!-- Inline (segment 1) -->
  <span class="caret-anchor"></span>        <!-- After inline -->
  " and also "                              <!-- TEXT_NODE (segment 2) -->
  <span class="caret-anchor"></span>        <!-- Before inline -->
  <span class="inline-element">@node-6</span>  <!-- Inline (segment 3) -->
  <span class="caret-anchor"></span>        <!-- After inline -->
</div>
```

### Children (in order):
1. TEXT_NODE: "Check out "
2. SPAN.caret-anchor
3. SPAN.inline-element: "@node-8"
4. SPAN.caret-anchor
5. TEXT_NODE: " and also "
6. SPAN.caret-anchor
7. SPAN.inline-element: "@node-6"
8. SPAN.caret-anchor

---

## THE COUNTING BUG

### getSegmentIndexFromTextNode logic:

```typescript
let segmentIndex = 0;
let child = contentEl.firstChild;

while (child) {
  if (child === textNode) {
    return segmentIndex;  // Found it!
  }
  
  if (child.nodeType === Node.TEXT_NODE) {
    segmentIndex++;  // ← BUG: Increments BEFORE checking if match
  } else if (child.nodeType === Node.ELEMENT_NODE) {
    if (elem.classList.contains('inline-element')) {
      segmentIndex++;
    }
  }
  
  child = child.nextSibling;
}
```

### Walk for FIRST text node "Check out ":

1. child = TEXT_NODE "Check out "
2. Check: `if (child === textNode)` → YES, match!
3. **Return segmentIndex = 0** ✅ CORRECT

### But logs show segmentIndex: 1 ❌

**This means it's NOT finding the first text node.**

---

## HYPOTHESIS

**Problem:** Multiple text nodes exist for same segment

When browser places cursor at end of "Check out ", it might be in a DIFFERENT text node than the one rendered.

**Possible causes:**
1. Browser splits text nodes
2. Caret-anchors cause text node splitting
3. Selection is in a text node that's not the rendered one

---

## THE REAL FIX NEEDED

### Option 1: Fix getSegmentIndexFromTextNode
- Account for multiple text nodes per segment
- Group adjacent text nodes
- Map to correct segment

### Option 2: Fix cursor position from offset
- If cursor is at end of text segment (offset === text.length)
- AND next segment is inline
- Return: `{segmentIndex: nextSegmentIndex, offset: 0}`

### Option 3: Simplify DOM structure
- Remove caret-anchors
- Use different technique for inline cursor positioning

---

## IMMEDIATE FIX (Attempt)

Check if cursor is at boundary between text and inline:

```typescript
// In getNodePositionFromSelection, CASE C:
if (anchor.nodeType === Node.TEXT_NODE) {
  const segmentIndex = getSegmentIndexFromTextNode(anchor);
  const offset = sel.anchorOffset;
  
  // Check if at end of text segment (before inline)
  const textContent = anchor.textContent || '';
  if (offset === textContent.length) {
    // At end of text - might be before inline
    const nextSibling = anchor.nextSibling;
    if (nextSibling?.nodeType === Node.ELEMENT_NODE) {
      const elem = nextSibling as HTMLElement;
      if (elem.classList.contains('caret-anchor')) {
        // Next is caret-anchor, so we're before an inline
        // Return position at start of NEXT segment (the inline)
        return {
          nodeId: currentNode.id,
          segmentIndex: segmentIndex + 1,
          offset: 0
        };
      }
    }
  }
  
  return { nodeId: currentNode.id, segmentIndex, offset };
}
```

---

## STATUS

**Current:** Cursor mapping broken, splits at wrong position  
**Need:** Fix DOM → segment position mapping  
**Options:** Multiple approaches possible  

**Next:** Implement boundary detection fix or debug actual text node structure
