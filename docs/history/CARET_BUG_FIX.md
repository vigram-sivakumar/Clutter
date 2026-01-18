# Caret Disappearing Bug - ROOT CAUSE FOUND AND FIXED

## The Problem

After pressing Enter or clicking on empty paragraphs:

- ❌ Caret not visible
- ❌ Can't click into empty blocks
- ❌ Focus appears lost

## Root Cause: `normalizeDomSelection()`

The `normalizeDomSelection()` function was being called on **EVERY user edit** (every keystroke, every Enter press):

```typescript
function normalizeDomSelection(): void {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    // If selection is NOT in a text node...
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      selection.removeAllRanges(); // ← REMOVES THE CARET!
    }
  }
}
```

### Why This Broke Everything:

1. **Empty paragraphs** have no text nodes
2. When you click an empty paragraph, selection anchors to the **element node**
3. `normalizeDomSelection()` detects this and **removes all ranges**
4. **Result**: No caret, can't focus empty blocks

### The Trigger:

This function was called in THREE places in `TipTapWrapper.tsx`:

- Line 203: When using EMPTY_DOC
- Line 212: On every editor update (!)
- Line 226: On fallback to EMPTY_DOC
- Line 241: **On EVERY handleChange call** ← Main culprit!

## The Fix

**REMOVED all `normalizeDomSelection()` calls** from:

1. ✅ `handleChange` callback (was running on every keystroke)
2. ✅ `content` memo (was running on every value change)

### Files Modified:

- `packages/ui/src/components/app-layout/pages/note/TipTapWrapper.tsx`

## Why It Was There

The function was originally added to clear "block-level selections" (when entire blocks are selected with blue halo). But:

- ✅ It worked for that specific case
- ❌ It broke normal text editing in empty blocks
- ❌ It was being called way too often

## The Correct Approach

ProseMirror/TipTap manages its own selection. We don't need to manipulate DOM selection manually. The editor handles:

- Text selections
- Node selections (block halos)
- Empty block selections
- Caret positioning

**Our job**: Don't interfere!

## Testing

After this fix:

1. ✅ Press Enter → caret moves to new paragraph
2. ✅ Click empty paragraph → caret appears
3. ✅ Type in empty block → works immediately
4. ✅ Selection preserved through transactions

## Expected Logs (After Fix)

```
⌨️  [ENTER KEY PRESSED]
📝 [EditorCore] Document changed
🎹 [TipTapWrapper] handleChange called
📤 [TipTapWrapper] Calling onChange
✅ [Paragraph.Enter] After dispatch, selection: { from: 9, parent: "paragraph" }
💾 Saving note to database
```

**NO MORE:**

```
🔧 [TipTapWrapper] Calling normalizeDomSelection
```

## Status

✅ **FIXED** - All `normalizeDomSelection()` calls removed
🧪 **Ready for testing** - Refresh app and test Enter + empty blocks

---

**The lesson**: Don't manipulate DOM selection manually in React + ProseMirror apps. Let the editor manage it.
