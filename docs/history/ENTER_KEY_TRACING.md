# Enter Key Execution Tracing

## Complete Logging Added

I've added comprehensive console logging to trace the **entire execution path** when you press Enter.

### Files Modified with Tracing Logs:

1. **`packages/editor/plugins/keyboard/keymaps/enter.ts`**
   - Logs when Enter key handler is invoked
   - Shows selection before/after handling

2. **`packages/editor/plugins/keyboard/engine/KeyboardEngine.ts`**
   - Logs each rule being evaluated
   - Shows which rules pass/fail condition checks
   - Shows which rule ultimately handles the key

3. **`packages/editor/utils/keyboardHelpers.ts`**
   - Logs paragraph insertion steps
   - Shows position calculations
   - Shows selection before/after transaction

4. **`packages/editor/core/EditorCore.tsx`** (already logged)
   - Logs when document changes
   - Logs when content prop triggers updates

5. **`packages/ui/src/components/app-layout/pages/note/TipTapWrapper.tsx`** (already logged)
   - Logs when handleChange is called
   - Shows if it's blocked by hydration

6. **`packages/ui/src/components/app-layout/pages/note/NoteEditor.tsx`** (already logged)
   - Logs EditorEngine onChange events
   - Shows if it's user edit vs programmatic

## Expected Log Flow When You Press Enter

### Complete Trace (Success Path):

```
⌨️  [ENTER KEY PRESSED] ════════════════════════════════
📍 [Enter Handler] Starting Enter key handling
   from: 45, to: 45
   parentType: 'paragraph'
   parentText: 'Hello world'

🔧 [KeyboardEngine] Checking 8 rules for Enter

🔍 [KeyboardEngine] Evaluating rule: enter:exitEmptyBlockInToggle (priority: 115)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:splitListItem (priority: 110)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:exitEmptyListInWrapper (priority: 100)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:outdentEmptyList (priority: 90)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:exitEmptyList (priority: 85)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:exitEmptyHeading (priority: 80)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:exitEmptyWrapper (priority: 70)
   ⏭️  Skipped - condition not met

🔍 [KeyboardEngine] Evaluating rule: enter:createParagraphAfterHeading (priority: 60)
   ✓ Condition met - executing rule

📝 [insertParagraphAfterBlock] Starting paragraph insertion
   📍 Position calculation:
      blockPos: 0
      blockNodeSize: 45
      afterBlock: 45
      blockType: 'heading'
   📍 Selection BEFORE transaction:
      from: 45, to: 45
      parent: 'heading'
   ➕ Inserting paragraph at position: 45
   🎯 Setting selection to:
      targetPos: 46
      selectionFrom: 46, selectionTo: 46
   📤 Dispatching transaction...

   ✅ Rule succeeded: enter:createParagraphAfterHeading
   🛑 Stopping propagation

✅ [Enter Handler] Enter key handling complete
   handled: true
   from: 46, to: 46
   parentType: 'paragraph'  ← NEW PARAGRAPH!
════════════════════════════════════════════════════════

📝 [EditorCore] Document changed - firing onChange

🎹 [TipTapWrapper] handleChange called
   isHydrating: false
🔧 [TipTapWrapper] Calling normalizeDomSelection
📤 [TipTapWrapper] Calling onChange (going to EditorEngine.applyEdit)

[ENGINE] edit accepted
🔍 [NoteEditor] EditorEngine onChange { source: 'user' }
✅ [NoteEditor] User edit - persisting only, NOT updating React state

[ENGINE] emit { source: 'user' }
💫 updateNoteContent

   ✅ Transaction complete. Selection AFTER dispatch:
      from: 46, to: 46
      parent: 'paragraph'
```

## What the Logs Tell You

### 1. **Which Rule Handles Enter**

You'll see exactly which rule's condition passes:

```
✓ Condition met - executing rule
✅ Rule succeeded: enter:createParagraphAfterHeading
```

### 2. **Position Calculations**

Shows where the new block is inserted:

```
blockPos: 0
afterBlock: 45
targetPos: 46  ← Where caret should go
```

### 3. **Selection State**

Tracks selection through the entire flow:

- BEFORE: `from: 45, parent: 'heading'`
- AFTER: `from: 46, parent: 'paragraph'`

### 4. **If Selection Gets Overwritten**

If you see:

```
✅ Transaction complete. Selection: from: 46, parent: 'paragraph'
```

But then later:

```
🔄 [EditorCore] Content prop changed - calling setContent()
```

That means something overwrote the selection.

## Testing Instructions

### 1. Rebuild Editor Package

```bash
cd packages/editor && npm run build
```

### 2. Refresh the App

Hard refresh: `Cmd+Shift+R`

### 3. Open Console

`Cmd+Option+I` → Console tab

### 4. Press Enter

You'll see the complete execution trace!

### 5. Look For These Key Points:

#### ✅ Good Signs:

- Only **ONE** `⌨️ [ENTER KEY PRESSED]` banner
- Selection changes from old block to new block
- `✅ [NoteEditor] User edit - persisting only` (not updating React state)
- **NO** `🔄 [EditorCore] Content prop changed - calling setContent()`

#### ❌ Bad Signs:

- **TWO** `⌨️ [ENTER KEY PRESSED]` banners (double execution)
- Selection doesn't change parent type
- `🔄 [EditorCore] Content prop changed - calling setContent()` appears
- Double `[ENGINE] emit` for single key press

## Troubleshooting

### If You See Double Execution

Look for:

- Two Enter handler invocations
- Which rule fires twice
- Where the second call originates

### If Selection Doesn't Move

Look for:

- Selection BEFORE vs AFTER transaction
- Does targetPos match final selection?
- Is setContent() called after dispatch?

### If Caret Disappears

Look for:

- Selection set correctly initially?
- Something calling setContent() or setEditorState()?
- DOM selection being cleared?

## Next Steps

After you test and share the logs, we'll be able to see:

1. Which rule handles your specific Enter scenario
2. Whether selection is set correctly
3. What (if anything) overwrites it
4. Why focus is lost

This will give us the complete picture! 🔍
