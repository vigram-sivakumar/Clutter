# Phase 3B Complete — @Mention UX

## Execution Model (Locked)

@mentions create **semantic references**, not inline text.

Three mention types with distinct behaviors:

1. **@Node** → Adds reference, removes text
2. **@Date** → Sets due property, removes text
3. **@Document** → Ambiguous, user chooses action

---

## What Was Implemented

### 1. Enhanced Mention Context (`input/grammarTypes.ts`)

**Extended GrammarContext:**

```typescript
{
  nodeId: string;
  cursorOffset: number;
  documentId: string;
  workspaceId: string;
  availableNodes: Array<{ id: string; label: string }>; // NEW
  availableDocuments: Array<{ id: string; name: string }>; // NEW
}
```

Available entities passed to grammar detection for real-time suggestion matching.

### 2. Email Pattern Detection (`input/parseMention.ts`)

**`isEmailPattern(text, atIndex)`**

- Detects `email@domain.com` patterns
- Prevents grammar activation on emails
- Heuristics: word chars before @ + domain pattern after

**Guard rule:**

```
user@example.com  → Ignored (email)
@UserName         → Active (mention)
```

### 3. Enhanced Mention Suggestions (`input/parseMention.ts`)

**`getMentionSuggestions()` now returns:**

```typescript
{
  type: 'node' | 'date' | 'document',
  value: string,      // ID for lookup
  display: string,    // Display name
  category: 'Nodes' | 'Dates' | 'Documents'  // NEW
}
```

**Grouping:**

- Nodes (references)
- Dates (today, tomorrow, yesterday)
- Documents (workspace navigation)

**Shows all groups on `@` with no filter**, filtered on typing.

### 4. Enhanced Mention Resolution (`input/resolveIntent.ts`)

**Node mentions:**

```typescript
@ProjectAlpha
→ Candidates: [
  {
    commandType: 'ref.add',
    confidence: 'high',
    reason: 'Reference ProjectAlpha',
    params: {
      fromNodeId: context.nodeId,
      to: { type: 'local', nodeId: 'node-123' },
      mentionText: '@ProjectAlpha'
    }
  }
]
```

**Date mentions:**

```typescript
@today
→ Candidates: [
  {
    commandType: 'prop.set',
    confidence: 'high',
    reason: 'Set due date: today',
    params: {
      nodeId: context.nodeId,
      key: 'due',
      value: '2026-02-05',
      mentionText: '@today'
    }
  }
]
```

**Document mentions (ambiguous):**

```typescript
@Inbox
→ Candidates: [
  {
    commandType: 'document.switch',
    confidence: 'medium',
    reason: 'Switch to Inbox'
  },
  {
    commandType: 'ref.add',
    confidence: 'low',
    reason: 'Reference Inbox'
  }
]
```

User must choose via GrammarChooser.

### 5. Enhanced GrammarChooser (`ui/grammar/GrammarChooser.tsx`)

**Mention-specific grouping:**

- Groups by category (Nodes, Dates, Documents)
- Category headers for mentions (same style as slash)
- `getMentionCategory()` helper for categorization

**Display structure:**

```
NODES
  Reference ProjectAlpha
  Reference TaskList

DATES
  Set due date: today
  Set due date: tomorrow

DOCUMENTS
  Switch to Inbox
  Reference Inbox
```

### 6. Text Removal After Commit (`NodeEditor.tsx`)

**Updated `commitGrammar()`:**

- **Slash** → Text removed
- **Mention** → Text removed (reference is semantic, not textual)
- **Hashtag** → Text kept (properties stay inline)

```typescript
const shouldRemoveText = grammar.type === 'slash' || grammar.type === 'mention';
```

**Result:**

```
Before: "See @ProjectAlpha for details"
After commit: "See  for details" + ref added
Cursor: Where @ started
```

### 7. NodeEditor Context Updates

**`updateGrammarDetection()` now builds:**

- `availableNodes` from `editorState.nodes` (filtered: not deleted, not self)
- `availableDocuments` from `documents` registry
- Passed to `detectGrammar()` and `resolveIntent()`

**Real-time entity matching** during typing.

---

## Commit Semantics (Locked)

### @Node → ref.add

| Before                | After                |
| --------------------- | -------------------- |
| Text: `@ProjectAlpha` | Text: ``             |
| Refs: `[]`            | Refs: `['node-123']` |
| Cursor: `14`          | Cursor: `0`          |
| **Undoable**          | ✓                    |

### @Date → prop.set(due=date)

| Before                      | After                          |
| --------------------------- | ------------------------------ |
| Text: `@today`              | Text: ``                       |
| Props: `{}`                 | Props: `{ due: '2026-02-05' }` |
| Cursor: `6`                 | Cursor: `0`                    |
| **Undoable**                | ✓                              |
| **Overwrites existing due** | ✓                              |

### @Document → Ambiguous Choice

| Before              | After (Switch)      | After (Reference)        |
| ------------------- | ------------------- | ------------------------ |
| Text: `@Inbox`      | Text: `@Inbox`      | Text: ``                 |
| Document: `Current` | Document: `Inbox`   | Document: `Current`      |
| -                   | Navigation happened | Refs: `['inbox-doc-id']` |
| **User chooses**    | Via GrammarChooser  | Via GrammarChooser       |

---

## Keyboard Behavior (Identical to Slash)

| Key   | Action                      |
| ----- | --------------------------- |
| ↑↓    | Navigate categories & items |
| ↵     | Commit selected             |
| Space | Commit + continue typing    |
| Tab   | Autocomplete (single match) |
| Esc   | Cancel                      |

---

## Cancellation & Guardrails

**Ignored patterns:**
✅ `email@domain.com` - Email pattern detector prevents grammar  
✅ `@mid-word` - Word boundary detection prevents  
⚠️ `@inside code block` - Deferred (no code block detection yet)

**Cancelled on:**
✅ Cursor move outside range  
✅ Escape press  
✅ Space before selection made (debatable, but follows model)

---

## User Flow Examples

### Example 1: Quick Node Reference

```
Type: @Proj
See: NODES
       Reference ProjectAlpha
       Reference ProjectBeta
     DATES
       (dates shown)
Arrow: Down to ProjectAlpha
Enter: Reference added, @Proj removed
```

### Example 2: Date Mention

```
Type: @tod
See: DATES
       Set due date: today
       Set due date: tomorrow
Enter: due=2026-02-05, @tod removed
```

### Example 3: Document Ambiguity

```
Type: @Inbox
See: DOCUMENTS
       Switch to Inbox     (medium confidence)
       Reference Inbox     (low confidence)
Arrow: Choose action
Enter: Selected action executes
```

---

## Phase 3B Exit Criteria (ALL MET)

✅ `@node` → adds ref, no text left behind  
✅ `@today` → sets due property  
✅ `@document` → prompts choice (ambiguity handled)  
✅ Undo works in all cases  
✅ Email patterns ignored  
✅ Grouped by entity type (Nodes/Dates/Documents)  
✅ NO visual polish added (intentional)

---

## What We Did NOT Do (Intentional)

❌ No visual design/polish  
❌ No mention cards (visual representation)  
❌ No date pickers  
❌ No icons  
❌ No colors/theming  
❌ No animations  
❌ No code block detection (deferred)

**Functional mechanics complete. Visual design later.**

---

## Files Modified

**Enhanced:**

- `src/input/grammarTypes.ts` (+5 lines)
  - Extended GrammarContext with availableNodes/Documents

- `src/input/parseMention.ts` (+40 lines)
  - Enhanced getMentionSuggestions with category grouping
  - Added isEmailPattern detector
  - Returns structured suggestions for chooser

- `src/input/resolveIntent.ts` (+60 lines)
  - Better mention intent resolution
  - Generates candidates from available entities
  - Handles ambiguous document mentions

- `src/input/detectGrammar.ts` (+8 lines)
  - Email pattern filtering
  - Imports isEmailPattern

- `src/ui/grammar/GrammarChooser.tsx` (+30 lines)
  - Mention category grouping
  - getMentionCategory helper
  - Shows categories for mentions

- `src/NodeEditor.tsx` (+40 lines)
  - Builds availableNodes/Documents context
  - Passes to updateGrammarDetection
  - Removes mention text after commit

- `src/input/index.ts` (+1 export)
  - Export isEmailPattern

**Zero linter errors in new code.**  
**All mention mechanics functional.**

---

## Architecture Flow

```
User types "@"
    ↓
detectGrammar() (checks not email)
    ↓
parseMention()
    ↓
resolveIntent() (with availableNodes/Documents)
    ↓
GrammarChooser (grouped: Nodes/Dates/Documents)
    ↓
User selects
    ↓
commitGrammar() (removes @ text)
    ↓
executeCommand() (ref.add or prop.set)
    ↓
Undo works automatically
```

---

## Next: Phase 3C — #Hashtag UX

**Hashtags are different:**

- ✅ Stay inline (not removed after commit)
- ✅ Show as property chips
- ✅ Bulk parsing (multiple hashtags in one node)
- ✅ Inline suggestions while typing

**Mentions are locked and correct.**

**Ready for Phase 3C: #Hashtag UX**
