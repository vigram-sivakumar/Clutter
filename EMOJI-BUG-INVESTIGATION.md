# 🐛 EMOJI BUG - INVESTIGATION

**Discovered:** During Batch 3.1 testing  
**Status:** Batch 2 issue (NOT Batch 3 regression)  
**Severity:** MEDIUM (edge case with emojis)

---

## 🔍 BUG REPRODUCTION

### **Steps:**
```
1. Type: "Hello 👋🏼 world"
2. Position cursor BEFORE emoji (between "Hello " and "👋🏼")
3. Press Enter
   Result: Splits correctly ✅
   Node 1: "Hello "
   Node 2: "👋🏼 world"

4. Press Backspace (to merge back)
   Result: Merges ✅
   Node: "Hello 👋🏼 world"
   Cursor: Should be at junction (before "👋🏼")

5. Press Enter AGAIN
   Result: Creates empty node ❌
   Expected: Should split at cursor position
```

### **Frequency:**
- Reproducible: YES (100%)
- Affects: Emojis (multi-byte characters)
- Verified: Exists in Batch 2 state (before Batch 3.1)

---

## 💡 HYPOTHESIS

### **Likely Cause:**
After merge (step 4), cursor position is incorrect.

**Possible issues:**
1. Emoji is multi-byte UTF-16 character
2. JavaScript string length vs actual character position mismatch
3. `mergeWithPrevious` junction calculation doesn't handle emojis
4. `getNodePositionFromSelection` returns wrong position for emoji

### **The emoji `👋🏼`:**
- Visual: Single emoji
- Actual: Base emoji (👋) + skin tone modifier (🏼)
- JavaScript length: 4 characters (2 surrogate pairs)
- DOM: Rendered as single visual unit

---

## 🔬 INVESTIGATION NEEDED

### **Check #1: What does mergeWithPrevious return?**
After merging "Hello " + "👋🏼 world":
- What is cursor.segmentIndex?
- What is cursor.offset?
- Is it pointing to the right position?

### **Check #2: What does getNodePositionFromSelection return?**
After merge, when cursor is visually before emoji:
- What segmentIndex does it return?
- What offset does it return?
- Does it match what mergeWithPrevious set?

### **Check #3: What happens during second Enter?**
When Enter is pressed the second time:
- What cursor position is read?
- What does the split think the cursor position is?
- Why does it create an empty node?

---

## 🎯 DEBUGGING STRATEGY

### **Step 1: Add console logging**
In `mergeWithPrevious` (SegmentedEditor.ts):
```typescript
console.log('[MERGE DEBUG]', {
  previousSegments: previous.segments,
  junctionIndex,
  resultCursor: {
    segmentIndex: cursorResult.segmentIndex,
    offset: cursorResult.offset
  }
});
```

### **Step 2: Add logging in Enter handler**
In NodeEditor.tsx Enter handler:
```typescript
console.log('[ENTER DEBUG]', {
  beforeExtract: {
    modelCursor: modelRef.current!.getCursor(),
    textContent: activeNodeElement.textContent
  },
  afterExtract: {
    segments,
    cursor: cursor
  }
});
```

### **Step 3: Reproduce and check logs**
1. Do the emoji test
2. Check console for cursor positions
3. Identify where cursor goes wrong

---

## 🔧 POTENTIAL FIXES

### **Fix Option A: Emoji-aware string length**
If the issue is JavaScript string length vs actual characters:
- Use `Array.from(text).length` instead of `text.length`
- Or use Unicode-aware segmenter

### **Fix Option B: DOM-based cursor reading**
If DOM reports correct position but we calculate wrong:
- Trust `sel.anchorOffset` from browser (we already do this in Batch 2)
- Issue might be in how we interpret it

### **Fix Option C: Validate cursor after merge**
Add validation that cursor is within valid range:
```typescript
// After merge, ensure cursor is valid
if (cursor.offset > segment.text.length) {
  cursor.offset = segment.text.length;
}
```

---

## 📊 IMPACT ASSESSMENT

### **Severity: MEDIUM**
- Data loss: NO (just creates empty node)
- Crash: NO
- Affects: Only multi-byte characters (emojis, some Unicode)
- Workaround: User can delete empty node and try again

### **Scope:**
- Does NOT affect regular text ✅
- Does NOT affect inline elements (@refs) ✅
- Does affect emojis ❌
- May affect other Unicode (Arabic, Chinese, etc.) ❌

---

## 🎯 NEXT STEPS

**Immediate:**
1. Add debug logging
2. Reproduce bug with logging
3. Identify exact failure point
4. Design fix
5. Test fix
6. Commit separately

**Timeline:**
- Investigation: 15-30 min
- Fix: 15-30 min
- Testing: 15 min
- **Total: ~1 hour**

---

## 🚦 STATUS

- [x] Bug discovered
- [x] Reproduced consistently
- [x] Confirmed NOT a Batch 3 regression
- [ ] Root cause identified
- [ ] Fix designed
- [ ] Fix implemented
- [ ] Fix tested
- [ ] Fix committed

---

**Pausing Batch 3 until this is resolved.**

**Batch 2 must be bulletproof before we continue.**
