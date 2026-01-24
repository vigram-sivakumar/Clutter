# Chrome System - Testing & Verification

## ✅ What's Been Done

### 1. Core Architecture Fixed (4 Critical Fixes)
- ✅ **Fix #1:** Scroller-safe positioning (`getBoundingClientRect` relative to overlay)
- ✅ **Fix #2:** Hover lock semantics (shared ownership between rows & chrome)
- ✅ **Fix #3:** Gutter-based layout (no negative margins)
- ✅ **Fix #4:** Opacity-based visibility (never unmount)

### 2. Files Modified
- ✅ `EditorChromeLayer.tsx` - Complete chrome system
- ✅ `utils/chromeHoverManager.ts` - Hover state manager with lock semantics
- ✅ `ParagraphBlock.tsx` - **WIRED** with hover handlers (test block)
- ✅ `CHROME_REFACTOR.md` - Architecture documentation

### 3. Debug Logging Added (Temporary)
- ✅ ChromeRow logs state on every render
- ✅ chromeHoverManager logs hover changes
- ✅ chromeHoverManager logs lock/unlock operations

---

## 🧪 Testing Steps

### Step 1: Verify Chrome Renders
1. Open the editor
2. Check console for `[ChromeRow] State:` logs
3. **Expected:** Chrome exists in DOM (you confirmed this ✅)

### Step 2: Test Paragraph Hover
1. Hover over any paragraph block
2. Check console for:
   ```
   [chromeHoverManager] setHovered: <blockId>
   [ChromeRow] State: { blockId: <id>, visible: true, top: <number> }
   ```
3. **Expected:**
   - Chrome appears (+ button, ⋮⋮ handle, ⋯ menu)
   - Chrome is positioned next to the hovered paragraph
   - Chrome is vertically aligned with text line

### Step 3: Test Typing Suppression
1. Hover paragraph → chrome appears
2. Click into paragraph → start typing
3. **Expected:**
   - Chrome fades out while typing
   - After 1 second of no typing, chrome reappears

### Step 4: Test Chrome Hover Continuity
1. Hover paragraph → chrome appears
2. Move cursor from paragraph → into chrome (+ or ⋮⋮)
3. **Expected:**
   - Chrome stays visible (no flicker)
   - Console shows lock/unlock messages
4. Move cursor away from both → chrome disappears

### Step 5: Test Scrolling
1. Hover paragraph → chrome appears
2. Scroll the editor
3. **Expected:**
   - Chrome stays aligned with paragraph
   - No drift or detachment

---

## 🐛 Known Issues to Check

### Issue: Chrome not visible
- **Symptom:** HTML shows `opacity: 0`
- **Cause:** `hoveredBlockId` is null (block not wired)
- **Fix:** Wire remaining blocks (Heading, ListBlock, etc.)

### Issue: Chrome at top (top: 0)
- **Symptom:** Chrome appears at editor top, not at hovered block
- **Cause:** `blockId` is null in effect, or query fails
- **Debug:**
  ```javascript
  // Check if query succeeds:
  const row = document.querySelector(`[data-block-id="${blockId}"]`);
  console.log('Row element:', row);
  ```

### Issue: Chrome flickers on row→chrome transition
- **Symptom:** Chrome disappears when moving cursor into it
- **Cause:** Lock semantics not working
- **Debug:**
  ```javascript
  // Check lock counter in console:
  [chromeHoverManager] LOCK hover, locks: 1  // Should increment when hovering button
  [chromeHoverManager] setHovered(null) BLOCKED (locked)  // Block should be blocked from clearing
  ```
- **Fix Applied:** 
  - Buttons now have `pointerEvents: 'auto'` and lock/unlock handlers
  - `setHovered(null)` is blocked while locked
  - Chrome wrapper has `pointerEvents: 'none'` (doesn't block content)

---

## 📊 Debug Console Output (Expected)

### On Hover Enter:
```
[chromeHoverManager] setHovered: abc-123-def
[ChromeRow] State: {
  blockId: 'abc-123-def',
  visible: true,
  top: 42,
  hasBlockId: true,
  computedOpacity: 1
}
```

### On Chrome Hover:
```
[chromeHoverManager] clearIfUnlocked, locks: 1  // Locked!
```

### On Hover Exit:
```
[chromeHoverManager] clearIfUnlocked, locks: 0
[chromeHoverManager] setHovered: null
[ChromeRow] State: {
  blockId: null,
  visible: false,
  top: 42,
  hasBlockId: false,
  computedOpacity: 0
}
```

---

## 🔜 Next Steps (After Testing)

### If Chrome Works on Paragraphs:
1. ✅ Remove debug logging
2. ✅ Wire remaining blocks:
   - `Heading.tsx`
   - `ListBlock.tsx`
   - `CodeBlock.tsx`
   - `Callout.tsx`
   - `Blockquote.tsx`
   - `HorizontalRule.tsx`
3. ✅ Test each block type
4. ✅ Lock architecture (ESLint rules)

### If Chrome Doesn't Work:
1. Check console logs for clues
2. Verify `data-block-id` is on DOM elements
3. Verify `editor-chrome-overlay` class exists
4. Check if hover handlers are firing

---

## 🚨 Testing Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Chrome never appears | `hoveredBlockId` always null | Check pointer events firing |
| Chrome at wrong position | `offsetTop` vs `getBoundingClientRect` issue | Check overlay query |
| Chrome flickers | Lock semantics broken | Check lock counter in logs |
| Chrome stays after hover | `clearIfUnlocked` not called | Check pointer leave handler |
| Chrome doesn't hide while typing | Typing suppression broken | Check `isTyping` state |

---

**Current Status:** Chrome system architecturally complete. ParagraphBlock wired as test. Ready for testing in browser. 🎯
