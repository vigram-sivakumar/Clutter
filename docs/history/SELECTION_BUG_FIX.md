# Selection Bug Fix - Caret Disappears After Enter

## Problem

When pressing Enter (in headings, paragraphs, anywhere):

- ✅ New block created successfully
- ✅ Document updated correctly
- ❌ **Caret disappears / stays in old block**

## Root Cause: Circular Update Loop

### The Broken Flow (Before Fix)

```
User presses Enter
  ↓
Transaction sets selection correctly (insertParagraphAfterBlock)
  ↓
EditorCore.onUpdate fires
  ↓
Calls onChange(editor.getJSON())
  ↓
Propagates: EditorCore → TipTapWrapper → NoteEditor
  ↓
EditorEngine.applyEdit accepts edit
  ↓
EditorEngine.emit fires with source: 'user'
  ↓
NoteEditor.onChange listener receives event
  ↓
⚠️ setEditorState({ document }) ← Updates React state
  ↓
content prop changes
  ↓
EditorCore.useEffect(content) triggers
  ↓
Calls editor.commands.setContent(content, false)
  ↓
💥 Selection is wiped! (setContent doesn't preserve selection)
```

### Why the Guard Didn't Work

EditorCore had an `isInternalUpdate` flag, but it had a race condition:

```typescript
// Line 218: Set flag
isInternalUpdate.current = true;
onChange(editor.getJSON());

// Line 221-223: Clear flag with 0ms timeout ⚠️
setTimeout(() => {
  isInternalUpdate.current = false;
}, 0);
```

By the time the `content` prop changes and `useEffect` runs (after propagating through NoteEditor → EditorEngine → back), the flag is already `false`.

## The Fix

**Don't update React state for user edits - the editor already has it!**

### Before (Broken)

```typescript
return editorEngine.onChange((event) => {
  // ❌ Always updates React state
  setEditorState({
    status: 'ready',
    document: event.document,
  });

  if (event.source === 'user') {
    updateNoteContent(event.noteId, event.document);
  }
});
```

### After (Fixed)

```typescript
return editorEngine.onChange((event) => {
  // ✅ For user edits: only persist, don't update React state
  if (event.source === 'user') {
    updateNoteContent(event.noteId, event.document);
    return; // ← Breaks the circular loop!
  }

  // ✅ Only update React state for programmatic changes
  setEditorState({
    status: 'ready',
    document: event.document,
  });
});
```

## Why This Works

### User Edits (Enter, typing, etc.)

1. User types → ProseMirror updates document **with selection**
2. `onUpdate` fires → calls `onChange()`
3. Propagates to EditorEngine → emits with `source: 'user'`
4. NoteEditor listener: **only persists, doesn't update state**
5. ✅ **No circular update → selection preserved**

### Programmatic Changes (note switch, external sync)

1. External change → EditorEngine.setDocument()
2. Emits with `source: 'programmatic'`
3. NoteEditor listener: **updates React state**
4. EditorCore receives new `content` prop
5. Calls `setContent()` to update editor
6. ✅ **Selection doesn't matter (new document loaded)**

## Architecture Principle

**Single Source of Truth:**

- For user edits: **ProseMirror owns the state**
- For programmatic changes: **React/Zustand owns the state**
- Never fight ProseMirror by re-applying content it just produced

## Test Results

After this fix:

- ✅ Enter in heading → caret moves to new paragraph
- ✅ Enter in paragraph → caret moves to new paragraph
- ✅ Split list → caret in correct position
- ✅ Exit wrapper → caret positioned correctly
- ✅ No double engine emits for single keystroke
- ✅ Selection preserved during all user edits

## Files Changed

1. ✅ `packages/ui/src/components/app-layout/pages/note/NoteEditor.tsx`
   - Lines 182-196: Fixed circular update loop

## Related Issues

This also fixes:

- Caret jumping during typing
- Selection loss after any keyboard action
- Double-emit patterns in logs
- Any scenario where selection mysteriously disappears

## Lessons Learned

### Anti-Pattern: Controlled Editor with State Override

```typescript
// ❌ DON'T DO THIS
onChange={(content) => {
  setState(content);
}}

useEffect(() => {
  editor.setContent(state); // ← Wipes selection!
}, [state]);
```

### Correct Pattern: Unidirectional Flow

```typescript
// ✅ DO THIS
onChange={(content) => {
  if (isUserEdit) {
    persist(content);
    // Let ProseMirror own the state
  } else {
    setState(content); // Only for external changes
  }
}}
```

## Why It Felt Like a ProseMirror Bug

The symptoms were:

- Node created ✅
- Transaction dispatched ✅
- `tr.setSelection()` called ✅
- But caret still wrong ❌

This made it look like ProseMirror wasn't respecting `setSelection()`. But actually:

1. ProseMirror **did** set selection correctly
2. Then we **immediately overwrote it** with `setContent()`
3. The bug was in our React layer, not ProseMirror

**ProseMirror was being brutally explicit - we were being accidentally destructive.**

---

**Status:** ✅ **FIXED**

- No more circular updates
- Selection preserved during all user actions
- Clean architecture aligned with TipTap/ProseMirror best practices
