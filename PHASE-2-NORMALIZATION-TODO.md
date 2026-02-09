# 🔒 PHASE 2 TODO - SEGMENT NORMALIZATION

**Status:** DEFERRED (intentionally)  
**Priority:** HIGH (after handler migration complete)  
**When:** Phase 2 - Full Architecture Integration  
**Date Created:** 2026-02-09  

---

## ⚠️ WHY THIS EXISTS

During Batch 2 emoji bug fix, we discovered that `extractSegmentsFromDOM()` was merging consecutive text segments, which broke cursor positions.

**Fix applied:** Removed merging during extraction (preserves cursor validity)  
**Side effect:** Model can now have consecutive text segments like `[text("Hello "), text("world")]`

**This is INTENTIONAL and CORRECT for now**, but should be normalized in Phase 2.

---

## 🎯 WHAT NEEDS TO BE DONE

### **Objective:**
Enforce invariant: **No consecutive text segments in model**

### **Where:**
Normalize segments after model operations (merge, split, etc.)

### **Why:**
- Cleaner model state
- Better performance (fewer segments to iterate)
- Matches production editor behavior (Notion, Tana, etc.)
- Prevents segment accumulation over time

---

## 📋 IMPLEMENTATION CHECKLIST

### **Step 1: Create Normalization Utility**
**File:** Create `/apps/editor/src/editor/SegmentNormalization.ts`

```typescript
/**
 * Normalize segments by merging consecutive text segments
 * 
 * INVARIANT: No two consecutive text segments
 * 
 * @returns Normalized segments + cursor translation map
 */
export function normalizeSegments(
  segments: Segment[],
  cursor?: { segmentIndex: number; offset: number }
): {
  normalized: Segment[];
  cursor?: { segmentIndex: number; offset: number };
} {
  const result: Segment[] = [];
  const segmentMap: number[] = []; // Old index → new index
  
  let currentTextIndex = -1;
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const last = result[result.length - 1];
    
    if (seg.type === 'text' && last?.type === 'text') {
      // Merge with previous text segment
      last.text += seg.text;
      segmentMap[i] = currentTextIndex;  // Points to merged segment
    } else {
      // New segment
      result.push({ ...seg });
      if (seg.type === 'text') {
        currentTextIndex = result.length - 1;
      }
      segmentMap[i] = result.length - 1;
    }
  }
  
  // Translate cursor if provided
  if (cursor) {
    const oldIndex = cursor.segmentIndex;
    const newIndex = segmentMap[oldIndex] ?? oldIndex;
    
    // Calculate offset in merged segment
    let offsetAdjustment = 0;
    for (let i = 0; i < oldIndex; i++) {
      if (segmentMap[i] === newIndex && segments[i].type === 'text') {
        offsetAdjustment += segments[i].text.length;
      }
    }
    
    return {
      normalized: result,
      cursor: {
        segmentIndex: newIndex,
        offset: cursor.offset + offsetAdjustment
      }
    };
  }
  
  return { normalized: result };
}
```

**Tests to add:**
```typescript
test('normalizeSegments - merge consecutive text', () => {
  const segments = [
    { type: 'text', text: 'Hello ' },
    { type: 'text', text: 'world' }
  ];
  
  const result = normalizeSegments(segments);
  
  expect(result.normalized).toEqual([
    { type: 'text', text: 'Hello world' }
  ]);
});

test('normalizeSegments - preserve inline boundaries', () => {
  const segments = [
    { type: 'text', text: 'Hello ' },
    { type: 'inline', id: 'ref1' },
    { type: 'text', text: ' world' }
  ];
  
  const result = normalizeSegments(segments);
  
  expect(result.normalized).toEqual(segments); // No merge (inline in between)
});

test('normalizeSegments - translate cursor', () => {
  const segments = [
    { type: 'text', text: 'Hello ' },
    { type: 'text', text: 'world' }
  ];
  
  const cursor = { segmentIndex: 1, offset: 0 };
  const result = normalizeSegments(segments, cursor);
  
  expect(result.cursor).toEqual({
    segmentIndex: 0,
    offset: 6  // "Hello ".length = 6
  });
});
```

---

### **Step 2: Call After Model Operations**
**Files to update:**

**A) `/apps/editor/src/editor/SegmentedEditor.ts`**
```typescript
export function mergeWithPrevious(prev, curr) {
  const merged = mergeNodes(prev, curr);
  const junctionIndex = prev.segments.length;
  
  // Calculate cursor BEFORE normalization
  let cursor = { segmentIndex: junctionIndex, offset: 0 };
  
  // Normalize segments + translate cursor
  const { normalized, cursor: translatedCursor } = normalizeSegments(
    merged.segments,
    cursor
  );
  
  return {
    merged: { ...merged, segments: normalized },
    cursor: translatedCursor
  };
}
```

**B) `/apps/editor/src/editor/SegmentOps.ts`**
```typescript
export function splitNodeAtCursor(node, segmentIndex, offset) {
  const { head, tail } = performGuaranteedSplit(node.segments, cursor);
  
  // Normalize both halves
  const { normalized: headNormalized } = normalizeSegments(head);
  const { normalized: tailNormalized } = normalizeSegments(tail);
  
  return {
    head: { ...node, segments: headNormalized },
    tail: { ...node, id: generateNodeId(), segments: tailNormalized }
  };
}
```

---

### **Step 3: Add Invariant Enforcement**
**File:** `/apps/editor/src/hardening/invariants.ts`

```typescript
/**
 * Verify no consecutive text segments
 */
export function assertNoConsecutiveTextSegments(segments: Segment[]): void {
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    
    if (prev?.type === 'text' && curr?.type === 'text') {
      throw new Error(
        `[INVARIANT] Consecutive text segments at index ${i - 1}, ${i}\n` +
        `Segments should be normalized.\n` +
        `Prev: "${prev.text}"\n` +
        `Curr: "${curr.text}"`
      );
    }
  }
}

// Call in development after every model operation
if (__DEV__) {
  assertNoConsecutiveTextSegments(node.segments);
}
```

---

### **Step 4: Update Tests**
Add tests for all operations:
- Split + normalize
- Merge + normalize + cursor translation
- Type + extract + normalize
- Round-trip: model → DOM → extract → should match original

---

## 📅 WHEN TO DO THIS

### **NOT NOW:**
- ❌ During Batch 2 bug fixing (just finished)
- ❌ During Batch 3 (selection handlers)
- ❌ During incremental migration

### **DO IN PHASE 2:**
✅ After all handlers migrated to coordinator  
✅ When refactoring model operations  
✅ When moving logic from NodeEditor.tsx  
✅ When everything is stable and testable  

**Estimated Phase 2 Timeline:** After Batch 3 complete

---

## 🎯 TRACKING

### **Documents Referencing This:**
- `EMOJI-BUG-FIX.md` - Explains why we removed merging
- `SEGMENT-MERGING-ANALYSIS.md` - Explains proper solution
- `PHASE-2-NORMALIZATION-TODO.md` - This document (tracking)

### **Related Code:**
- `/apps/editor/src/editor/DOMObserver.ts` - Extraction (no merging)
- `/apps/editor/src/editor/SegmentedEditor.ts` - Merge operations
- `/apps/editor/src/editor/SegmentOps.ts` - Split operations

---

## ✅ SUCCESS CRITERIA (PHASE 2)

When implementing normalization:

- [ ] `normalizeSegments()` function created
- [ ] Cursor translation logic implemented
- [ ] Called after merge operations
- [ ] Called after split operations
- [ ] Unit tests added (merge consecutive, preserve inline boundaries, cursor translation)
- [ ] Invariant enforcement added (dev mode)
- [ ] All existing tests pass
- [ ] No regressions
- [ ] Manual testing complete

---

## 🔒 CURRENT STATUS

**Now:**
- ✅ Emoji bug fixed (removed extraction merging)
- ✅ System stable
- ⏸️ Normalization deferred to Phase 2
- 📋 Tracked in this document

**Phase 2:**
- ⏳ Implement `normalizeSegments()`
- ⏳ Add cursor translation
- ⏳ Enforce invariant
- ⏳ Test thoroughly

---

## 📝 COMMIT REFERENCE

**Emoji fix commit:** Will include reference to this TODO

**Commit message will say:**
```
Note: Segments are not normalized during extraction to preserve cursor
positions. Normalization will be added in Phase 2 after architecture
integration. See PHASE-2-NORMALIZATION-TODO.md for details.
```

---

**END OF PHASE 2 TODO - NORMALIZATION TRACKED**

**Do not forget this. It's on the critical path for Phase 2.**
