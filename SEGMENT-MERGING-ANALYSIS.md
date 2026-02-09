# 🤔 SEGMENT MERGING ANALYSIS - DESIGN DECISION

**Question:** Why aren't we merging consecutive text segments?  
**Context:** User found it creates "redundant" segments  
**Date:** 2026-02-09  

---

## 📊 THE CURRENT SITUATION

### **After our fix:**
```typescript
// Model after merge:
segments = [
  { type: 'text', text: 'Hello ' },     // Segment 0
  { type: 'text', text: '👋🏼 world' }  // Segment 1
]

// React renders:
<div>
  "Hello "      ← TEXT_NODE (from segment 0)
  "👋🏼 world"   ← TEXT_NODE (from segment 1)
</div>

// Extract back:
segments = [
  { type: 'text', text: 'Hello ' },     // ✅ Segment 0
  { type: 'text', text: '👋🏼 world' }  // ✅ Segment 1
]

Cursor at segmentIndex: 1, offset: 0 → VALID ✅
```

### **With the old "optimization" (broken):**
```typescript
// Model after merge:
segments = [
  { type: 'text', text: 'Hello ' },
  { type: 'text', text: '👋🏼 world' }
]

// React renders: Same 2 TEXT_NODEs

// Extract back (WITH MERGING):
segments = [
  { type: 'text', text: 'Hello 👋🏼 world' }  // ❌ MERGED!
]

Cursor at segmentIndex: 1 → OUT OF BOUNDS! ❌
```

---

## 🎯 THE REAL QUESTION

**Should consecutive text segments exist at all?**

### **Option A: Allow Consecutive Text Segments** (Current)
```typescript
// Valid:
[text("Hello "), text("world")]

// Also valid:
[text("Hello world")]
```

**Pros:**
- ✅ Simple extraction (no merging logic)
- ✅ Cursor positions always valid
- ✅ No translation needed
- ✅ Reflects actual DOM structure

**Cons:**
- ❌ Model can have "redundant" segments
- ❌ Not normalized
- ❌ Segment count can grow over time
- ❌ Performance: More segments to iterate

---

### **Option B: Enforce "No Consecutive Text" Invariant** (Normalized)
```typescript
// Valid:
[text("Hello world")]

// Invalid (should be merged):
[text("Hello "), text("world")]  ❌
```

**Pros:**
- ✅ Clean, normalized model
- ✅ One text segment per text run
- ✅ Fewer segments = better performance
- ✅ Matches user mental model

**Cons:**
- ❌ Complex: Must merge during model operations
- ❌ Cursor translation required
- ❌ More code complexity
- ❌ More ways to introduce bugs

---

## 🔍 WHERE SHOULD MERGING HAPPEN?

If we enforce normalization, where should it happen?

### **❌ During Extraction (WRONG - This is what broke)**
```typescript
function extractSegmentsFromDOM(element) {
  // Merge consecutive text nodes
  if (lastSegment.type === 'text') {
    lastSegment.text += newText;  // ❌ Breaks cursor positions
  }
}
```

**Problem:** Cursor is already set based on pre-extraction segment count.

---

### **✅ During Model Operations (CORRECT)**
```typescript
function mergeWithPrevious(prev, curr) {
  const merged = mergeNodes(prev, curr);
  
  // Normalize: merge consecutive text segments
  merged.segments = normalizeSegments(merged.segments);
  
  // Translate cursor to normalized position
  const adjustedCursor = translateCursor(cursor, segmentMergeMap);
  
  return { merged, cursor: adjustedCursor };
}

function normalizeSegments(segments: Segment[]): Segment[] {
  const normalized = [];
  let currentText = '';
  
  for (const seg of segments) {
    if (seg.type === 'text') {
      currentText += seg.text;
    } else {
      if (currentText) {
        normalized.push({ type: 'text', text: currentText });
        currentText = '';
      }
      normalized.push(seg);
    }
  }
  
  if (currentText) {
    normalized.push({ type: 'text', text: currentText });
  }
  
  return normalized;
}
```

**This is the RIGHT place** because:
1. ✅ Happens during state mutation (merge operation)
2. ✅ Can translate cursor at the same time
3. ✅ Extraction stays simple (1:1 mapping)
4. ✅ Model is always normalized

---

### **✅ After Rendering (ALSO CORRECT)**
```typescript
// In NodeView rendering:
useEffect(() => {
  // When rendering, merge consecutive text segments
  const normalizedSegments = normalizeForRendering(node.segments);
  
  for (const seg of normalizedSegments) {
    // Render merged text as single TEXT_NODE
  }
}, [node.segments]);
```

**This is ALSO correct** because:
1. ✅ Model can have multiple text segments
2. ✅ Rendering merges them for efficiency
3. ✅ Extraction creates multiple segments again
4. ✅ Cursor positions stay valid

---

## 🎯 WHAT TANA MIGHT DO

I don't have access to Tana's source code, but based on common editor patterns:

### **Likely Approach:**

1. **Model Normalization:**
   - Tana likely normalizes segments at model level
   - No consecutive text segments allowed
   - Cursor positions translated during operations

2. **Operational Transform:**
   - When merging nodes, they normalize immediately
   - Cursor is translated based on merge operations
   - Extraction always matches model

3. **Immutable Data Structures:**
   - Each operation produces normalized output
   - No "drift" between model and DOM
   - Segment identity preserved through IDs, not positions

---

## 🔐 THREE VALID SOLUTIONS

### **Solution 1: No Merging (Current)** ⚡ Simplest
```typescript
// Allow multiple text segments
// Don't merge during extraction
// Don't merge in model
```

**When to use:** Early development, stability over optimization  
**Trade-off:** Segments can accumulate, but system is simple and predictable

---

### **Solution 2: Merge in Model Operations** 🎯 Best Long-term
```typescript
// Normalize after every operation that creates segments
function mergeWithPrevious(prev, curr) {
  const merged = mergeNodes(prev, curr);
  merged.segments = normalizeSegments(merged.segments);
  const cursor = translateCursorForNormalization(cursor, merged.segments);
  return { merged, cursor };
}
```

**When to use:** Production, performance matters  
**Trade-off:** More complex, but cleaner model

---

### **Solution 3: Merge During Rendering** 🔄 Hybrid
```typescript
// Model allows multiple text segments
// NodeView merges when rendering
// Extraction creates multiple segments again
```

**When to use:** When DOM structure doesn't match model structure  
**Trade-off:** Round-trip creates "different but equivalent" states

---

## ❓ RECOMMENDATION FOR YOUR EDITOR

Given where you are in migration:

### **Option A: Keep Current Fix (No Merging)** ✅ SAFE
**Reasoning:**
- You just fixed 4 critical bugs
- System is stable
- Batch 3 pending
- Normalization can wait

**When to normalize:** After full architecture integration (Phase 2)

---

### **Option B: Add Normalization Now** 🎯 PROPER
**Reasoning:**
- Fix the issue correctly from the start
- Prevents segment accumulation
- Matches production editor behavior
- Clean model state

**Effort:** 30-60 minutes
- Add `normalizeSegments()` utility
- Call after merge operations
- Add cursor translation logic
- Test thoroughly

---

## 🎯 MY RECOMMENDATION

**For now: Keep Solution 1 (No Merging)** for these reasons:

1. ✅ **Stability first** - You just fixed 4 bugs, don't introduce complexity
2. ✅ **Deferred optimization** - Normalization is optimization, not correctness
3. ✅ **Works correctly** - Multiple text segments are valid
4. ✅ **Easy to add later** - Can normalize in Phase 2

**Later (Phase 2): Add Solution 2 (Normalize in model)** because:
1. ✅ Cleaner model state
2. ✅ Better performance
3. ✅ Matches production editor expectations
4. ✅ You'll be refactoring anyway

---

## 🔍 INVARIANT ENFORCEMENT

If you want to enforce normalization later, add it to the model layer:

```typescript
// In EditorStateReducer or SegmentOps
function normalizeSegments(segments: Segment[]): Segment[] {
  const result: Segment[] = [];
  
  for (const seg of segments) {
    const last = result[result.length - 1];
    
    if (seg.type === 'text' && last?.type === 'text') {
      // Merge consecutive text segments
      last.text += seg.text;
    } else {
      result.push({ ...seg });
    }
  }
  
  return result;
}

// Call after operations that create segments:
export function mergeWithPrevious(prev, curr) {
  const merged = mergeNodes(prev, curr);
  merged.segments = normalizeSegments(merged.segments);  // ← Add this
  // ... cursor calculation with normalized segments
}
```

---

## ✅ DECISION POINT

**What do you want to do?**

### **Option A: Keep current fix, proceed to Batch 3** ✅ Recommended
- Emoji bug is fixed
- System is stable
- Add normalization in Phase 2

### **Option B: Add normalization now**
- Implement `normalizeSegments()`
- Call after merge operations
- Translate cursors
- Test thoroughly
- ~30-60 min effort

---

## 📝 ABOUT TANA

Without access to their source, I can't say definitively. But most production editors:
1. Normalize at model level
2. Keep model and DOM in sync
3. Use operational transforms for cursor translation

**Your current approach (no merging) is simpler and safer for migration phase.**

**You can add normalization later without breaking anything.**

---

**What would you like to do?**

**Say:**
- **"Keep it, continue Batch 3"** → Lock current fix, proceed
- **"Add normalization now"** → Implement proper merging with cursor translation
- **"Explain more"** → Deep dive into normalization strategies