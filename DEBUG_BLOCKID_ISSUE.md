# Debug: Empty Paragraph blockId Issue

## Problem

New notes show empty paragraphs WITHOUT blockId, causing ephemeral rendering (no block handle, no data attributes).

## What We Added (Debug Logging)

### 1. TipTapWrapper.tsx

- Logs incoming `value` from note
- Shows if parsing JSON/HTML or using null

### 2. EditorCore.tsx

- Logs `createEmptyParagraph()` execution and generated blockId
- Logs final content being passed to TipTap editor

### 3. ParagraphBlock.tsx

- Logs every render with blockId status
- **Warns when ephemeral render path is taken**

### 4. notes.ts

- Logs when content is saved back to store

## How to Debug

### Step 1: Clear Everything

```bash
# Stop dev server (Ctrl+C)
rm -rf node_modules/.vite
rm -rf node_modules/.cache
rm -rf .turbo
pkill -f "vite"
```

### Step 2: Start Fresh

```bash
npm run dev
```

### Step 3: Open Browser DevTools Console

- Open the app
- Open DevTools (F12 or Cmd+Option+I)
- Go to Console tab
- Clear the console

### Step 4: Create New Note

- Let the "Welcome to Clutter" note load
- Watch the console logs

## What to Look For

### ✅ CORRECT Flow (What Should Happen):

```
[TipTapWrapper] Parsing value: { value: '', valueType: 'string' }
[TipTapWrapper] No value, incomingContent = null
[createEmptyParagraph] Created: { blockId: '<UUID>', result: {...} }
[EditorCore] Using content: { incomingContent: null, finalContent: {...} }
[ParagraphBlock] Rendering: { blockId: '<UUID>', isEphemeral: false, ... }
```

### ❌ WRONG Flow (Current Bug):

```
[TipTapWrapper] ...
[createEmptyParagraph] ... (might not even appear!)
[EditorCore] ...
[ParagraphBlock] Rendering: { blockId: null, isEphemeral: true, ... }
[ParagraphBlock] ⚠️ EPHEMERAL RENDER - No blockId!
```

## Expected Diagnosis

Based on console logs, we'll know:

1. **If `createEmptyParagraph()` isn't being called**
   - → Code not being executed (build issue)
2. **If it's called but blockId is lost**
   - → TipTap is stripping the attrs
   - → Schema default is overriding it
3. **If it's called and blockId exists but ParagraphBlock sees null**
   - → Node attrs not being passed correctly
   - → React render timing issue

## Next Steps After Diagnosis

Once we see the console logs, we'll know exactly where the blockId is being lost and can fix it.

---

**After you see the logs, share them here so we can pinpoint the exact issue.**
