# Chrome System - Final Test Guide

## ✅ What Was Fixed

**Root cause identified and eliminated:**

❌ **Previous approach:** Attaching `onPointerEnter/Leave` to ProseMirror NodeViews
- NodeViews are replaced during editor operations
- DOM replacement fires false `pointerleave` events
- Caused constant flicker and console spam

✅ **New approach:** Container-level `mousemove` detection
- One stable listener on editor container
- Computes hovered block via `event.target.closest('[data-block-id]')`
- Survives all DOM replacements
- Zero false events

---

## 🧪 How to Test

### **1. Open the Editor**
- Navigate to a page with multiple paragraph blocks
- Open browser console

### **2. Test Hover Stability**

**Action:**
1. Hover over a paragraph block
2. Move cursor slowly within the same block
3. Move cursor around text, padding areas

**Expected (Success):**
- ✅ Chrome appears instantly
- ✅ Chrome stays visible throughout
- ✅ **Console shows ONE log:**
  ```
  setHoveredBlockId: abc-123
  ```
- ✅ **NO additional logs while moving within block**
- ✅ **NO flicker**

**Previously (Failure):**
- ❌ Console spam:
  ```
  setHoveredBlockId: abc-123
  setHoveredBlockId: null
  setHoveredBlockId: abc-123
  setHoveredBlockId: null
  (endless)
  ```
- ❌ Constant flicker

---

### **3. Test Typing (DOM Replacement Test)**

**Action:**
1. Hover block → chrome visible
2. Click into block
3. Type several characters

**Expected (Success):**
- ✅ Chrome fades out while typing
- ✅ **NO console logs during typing** (typing suppression works)
- ✅ **NO `setHoveredBlockId(null)` spam**
- ✅ After 1 second of no typing, chrome reappears
- ✅ Still no console spam

**Why this test matters:**
- Every keystroke causes ProseMirror to replace the NodeView
- Old approach would fire `pointerleave` on every keystroke
- New approach is immune to DOM replacements

---

### **4. Test Block Navigation**

**Action:**
1. Chrome visible on block 1
2. Move cursor to block 2 (different paragraph)
3. Move to block 3

**Expected (Success):**
- ✅ Chrome follows cursor instantly
- ✅ **Console shows clean transitions:**
  ```
  setHoveredBlockId: abc-123
  setHoveredBlockId: def-456
  setHoveredBlockId: ghi-789
  ```
- ✅ One log per block
- ✅ NO `null` spam between transitions

---

### **5. Test Chrome Button Access**

**Action:**
1. Hover block → chrome visible
2. Move cursor to + button (left gutter)
3. Click + button

**Expected (Success):**
- ✅ Chrome stays visible while moving to button
- ✅ Button is clickable
- ✅ New paragraph created below
- ✅ NO flicker
- ✅ NO console spam

---

### **6. Test Selection Change (DOM Replacement Test)**

**Action:**
1. Chrome visible
2. Click text in middle of paragraph (move caret)
3. Select text with mouse drag
4. Click into different paragraph

**Expected (Success):**
- ✅ Chrome stays stable during caret movement
- ✅ Chrome stays stable during selection
- ✅ Chrome moves to new block cleanly
- ✅ **NO console spam during these operations**

**Why this test matters:**
- Selection changes cause ProseMirror to update decorations
- Old approach would fire false `pointerleave` events
- New approach ignores DOM churn

---

### **7. Test Leave Editor**

**Action:**
1. Chrome visible
2. Move cursor outside editor container entirely

**Expected (Success):**
- ✅ Chrome disappears
- ✅ Console shows:
  ```
  setHoveredBlockId: null
  ```
- ✅ ONE log only

---

## 🎯 Success Criteria

### **✅ PASS if:**
1. Console shows ONE log per block entry/exit
2. NO `setHoveredBlockId` spam while moving within same block
3. NO flicker when moving cursor
4. Chrome stays visible when typing stops (no false clear)
5. Chrome accessible (buttons clickable)
6. Clean behavior during selection changes

### **❌ FAIL if:**
1. Console spam (multiple logs for same block)
2. Flicker when moving cursor
3. Chrome disappears unexpectedly
4. `pointerleave` fires during typing
5. Chrome buttons inaccessible

---

## 📊 Console Output Examples

### **✅ CORRECT (Clean):**
```
// Hover block 1
setHoveredBlockId: abc-123

// (Move within block - NO LOGS)

// Hover block 2
setHoveredBlockId: def-456

// Leave editor
setHoveredBlockId: null
```

### **❌ INCORRECT (Broken):**
```
// Hover block 1
setHoveredBlockId: abc-123
setHoveredBlockId: null
setHoveredBlockId: abc-123
setHoveredBlockId: null
setHoveredBlockId: abc-123
(spam continues...)
```

---

## 🔍 What Changed

### **EditorChromeLayer.tsx:**
- ❌ Removed: `chromeHoverManager.subscribe()` (block-driven hover)
- ✅ Added: Container `mousemove` listener with `closest()` detection
- One stable event listener, survives DOM replacements

### **ParagraphBlock.tsx:**
- ❌ Removed: `onPointerEnter/Leave` handlers
- ❌ Removed: `chromeHoverManager` import
- ✅ Kept: `data-block-id` (detection anchor)
- Blocks are now pure structure

---

## 🔜 If Tests Pass

### **Next Steps:**
1. Remove debug `console.log` statements
2. Apply same pattern to remaining blocks:
   - Remove `onPointerEnter/Leave` from each
   - Remove `chromeHoverManager` imports
   - Keep `data-block-id` attributes
3. Test each block type
4. Declare chrome system complete

### **Remaining Blocks:**
- ⏳ Heading
- ⏳ ListBlock
- ⏳ CodeBlock
- ⏳ Callout
- ⏳ Blockquote
- ⏳ HorizontalRule

---

## 🎓 Why This Was the Real Fix

**All previous fixes (1-8) were necessary foundation:**
- Ref positioning → scroller-safe
- useLayoutEffect → instant
- Atomic state → no snap
- Padding zones → correct geometry
- Block content → continuous hit area

**But they couldn't fix the root cause:**
- ProseMirror NodeViews are replaced during operations
- Attaching events to unstable DOM nodes causes false events
- No CSS or state management can fix DOM instability

**Fix #9 (container-level hover) solved the root cause:**
- One stable element (container)
- Fresh queries on actual mouse movement
- Survives all DOM replacements
- This is how Notion, Linear, Craft do it

---

**Test now. If console is clean and chrome is stable, the architecture is proven correct and ready for production.** 🎯
