# Enter Key Selection Debug Session

## Problem Statement

When pressing Enter in a heading:

- ✅ New empty paragraph is created
- ❌ Caret stays in the previous block (visually doesn't move)

## Hypothesis

The transaction modifies the document but **never sets a new selection**.
ProseMirror keeps the caret at the old resolved position.

## Diagnostic Logs Added

### 1. Main Enter Handler (`packages/editor/plugins/keyboard/keymaps/enter.ts`)

```typescript
handleEnter(editor: Editor): boolean {
  // Logs BEFORE engine processes
  console.log('[Enter] BEFORE', { from, to, parentType });

  const handled = enterEngine.handle(editor, 'Enter');

  // Logs AFTER engine completes
  console.log('[Enter] AFTER', { handled, from, to, parentType });
}
```

### 2. OLD Heading Handler (`packages/editor/extensions/nodes/Heading.ts`)

```typescript
Enter: ({ editor }) => {
  console.log('[OLD Heading.Enter] Handler called');
  // ... logs throughout execution
  // Calls insertParagraphAfterBlock()
};
```

### 3. Paragraph Insertion Helper (`packages/editor/utils/keyboardHelpers.ts`)

```typescript
insertParagraphAfterBlock(...) {
  // 🔍 BEFORE dispatch
  console.log('[Enter Rule] BEFORE dispatch', {
    selectionFrom, selectionTo, parent
  });

  tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));
  editor.view.dispatch(tr);

  // 🔍 AFTER dispatch (with requestAnimationFrame)
  requestAnimationFrame(() => {
    console.log('[Enter Rule] AFTER dispatch', {
      selectionFrom, selectionTo, parent
    });
  });
}
```

### 4. NEW Keyboard Engine Rule (`packages/editor/plugins/keyboard/rules/enter/createParagraphAfterHeading.ts`)

```typescript
execute(ctx: KeyboardContext): boolean {
  // 🔍 BEFORE dispatch
  console.log('[Enter Rule - NEW ENGINE] BEFORE dispatch', {
    selectionFrom, selectionTo, parent
  });

  const result = editor.chain().splitBlock().setNode('paragraph').run();

  // 🔍 AFTER dispatch (with requestAnimationFrame)
  requestAnimationFrame(() => {
    console.log('[Enter Rule - NEW ENGINE] AFTER dispatch', {
      selectionFrom, selectionTo, parent
    });
  });
}
```

## What to Look For

### Expected Pattern (Old Handler - Most Likely)

```
[OLD Heading.Enter] Handler called
[OLD Heading.Enter] In heading { isEmpty: false, ... }
[Enter Rule] BEFORE dispatch { selectionFrom: X, selectionTo: X, parent: 'heading' }
[insertParagraphAfterBlock] Setting selection { targetPos: Y+1, ... }
[Enter Rule] AFTER dispatch { selectionFrom: ???, selectionTo: ???, parent: ??? }
```

### Key Questions to Answer:

1. **Which handler runs?** OLD vs NEW engine
2. **Does selection change?** Compare BEFORE vs AFTER
3. **Is targetPos correct?** Does it point to the new paragraph?
4. **Is selection set?** Does `actualSelectionFrom` match `targetPos`?

## Expected Findings

### Scenario A: Selection IS set but gets overridden

- BEFORE: `{ from: 10, to: 10, parent: 'heading' }`
- targetPos set to: `15`
- AFTER: `{ from: 10, to: 10, parent: 'heading' }` (unchanged!)
- **Conclusion**: Something is resetting the selection after dispatch

### Scenario B: Selection is NEVER set

- BEFORE: `{ from: 10, to: 10, parent: 'heading' }`
- No `tr.setSelection()` call executes
- AFTER: `{ from: 10, to: 10, parent: 'heading' }` (unchanged)
- **Conclusion**: Missing `tr.setSelection()` in the transaction

### Scenario C: Selection set to WRONG position

- BEFORE: `{ from: 10, to: 10, parent: 'heading' }`
- targetPos calculated incorrectly (e.g., still points to heading)
- AFTER: `{ from: 10, to: 10, parent: 'heading' }`
- **Conclusion**: Position calculation bug

## Next Steps After Logs

Once we confirm which scenario:

1. **If OLD handler runs**: Need to verify `insertParagraphAfterBlock` selection logic
2. **If NEW engine runs**: Need to add `tr.setSelection()` to the rule
3. **Position calculation**: Use `Selection.near()` or `TextSelection.near()` for safety

## The Fix (Once Confirmed)

The rule that creates the paragraph must:

```typescript
// Calculate insert position
const afterBlock = blockPos + blockNode.nodeSize;

// Insert paragraph
tr.insert(afterBlock, newParagraph);

// ✅ SET SELECTION (this is what's missing!)
tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));

// Dispatch
editor.view.dispatch(tr);
```

Or using the safer API:

```typescript
tr.setSelection(Selection.near(tr.doc.resolve(afterBlock + 1), 1));
```

## Files Modified

1. ✅ `packages/editor/plugins/keyboard/keymaps/enter.ts`
2. ✅ `packages/editor/extensions/nodes/Heading.ts`
3. ✅ `packages/editor/utils/keyboardHelpers.ts`
4. ✅ `packages/editor/plugins/keyboard/rules/enter/createParagraphAfterHeading.ts`

## Testing Instructions

1. **Reload the app** (dev server should HMR automatically)
2. **Open console** (Cmd+Option+I in Tauri desktop app)
3. **Create a heading** (type `# Heading`)
4. **Press Enter** at the end of the heading
5. **Check console logs** for the patterns above
6. **Report findings**:
   - Which handler ran?
   - What were the BEFORE/AFTER selection values?
   - Did the parent type change?

## Current Status

🟡 **Awaiting Test Results**

Logs are in place. Need to:

1. Test Enter in a heading
2. Capture console output
3. Identify which scenario we're in
4. Apply the appropriate fix

---

_This is not a bug — it's ProseMirror being brutally explicit about selection management._
