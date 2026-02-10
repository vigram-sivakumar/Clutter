# Phase B — Input Grammar & Dispatch

## Purpose

Parse user input (/, @, #, plain text) into structured grammar objects that can be mapped to commands.

**Critical**: This is pure logic. No execution, no side effects, no UI assumptions.

## Pipeline

```
User Input → Grammar Detection → Grammar Parsing → Intent Resolution → Command Conversion
```

Each stage is pure and testable.

## Grammar Priority (Locked)

Resolution order from highest to lowest priority:

1. **Selection context** (if text is selected)
2. **Slash commands** `/`
3. **At-mentions** `@`
4. **Hashtags** `#`
5. **Plain text** (fallback)

This order prevents ambiguity. Never changes.

## Grammar Types

### 1. Slash Commands (`/`)

**Purpose**: Explicit structural or system actions

**Examples**:

- `/todo` → Convert to todo
- `/template Task` → Apply Task template
- `/delete` → Delete node
- `/new document` → Create document

**Grammar Structure**:

```typescript
{
  type: 'slash',
  keyword: 'template',
  args: ['Task'],
  range: { from: 0, to: 14 },
  raw: '/template Task'
}
```

**Maps to commands**:

- `template.apply`
- `node.delete`
- `document.create`

### 2. At-Mentions (`@`)

**Purpose**: Entity references or smart values

**Three subtypes**:

#### Node Mention

```typescript
@Project Alpha
→ {
  type: 'mention',
  subtype: 'node',
  identifier: 'Project Alpha',
  isExternal: false
}
→ Command: ref.add
```

#### Date Mention

```typescript
@today
@2026-03-01
→ {
  type: 'mention',
  subtype: 'date',
  value: '2026-03-01',
  originalFormat: 'today'
}
→ Command: prop.set(due=date)
```

#### Document Mention

```typescript
@Inbox
→ {
  type: 'mention',
  subtype: 'document',
  identifier: 'Inbox'
}
→ Ambiguous! Could be:
  - document.switch
  - ref.add (reference as node)
```

**External References**:

```typescript
@workspace:document:node
→ External node reference
```

### 3. Hashtags (`#`)

**Purpose**: Properties. Always. No other meaning.

**Examples**:

```typescript
#status        → { key: 'status', value: null }
#status done   → { key: 'status', value: 'done' }
#priority high → { key: 'priority', value: 'high' }
```

**Maps to**:

- `prop.set`
- `prop.remove`

### 4. Plain Text

**Fallback only**. Just insert text.

```typescript
hello world
→ Command: node.insertText
```

## Detection Rules

### Trigger Rules

Grammar only activates when:

- Cursor is inside a word starting with `/`, `@`, or `#`
- OR selection exists

### Cancel Rules

Grammar cancels when:

- **Space** is typed (commits the grammar)
- **Escape** is pressed
- **Cursor** moves outside grammar range

This prevents phantom commands.

## Ambiguity Handling

**No magic. No guessing.**

If input could map to multiple meanings:

1. Emit multiple candidate commands
2. Rank by confidence (high/medium/low)
3. UI decides which to use

**Example**:

```typescript
@Inbox
→ Candidates:
  1. { commandType: 'document.switch', confidence: 'medium' }
  2. { commandType: 'ref.add', confidence: 'low' }
```

## Module Structure

```
src/input/
├── grammarTypes.ts        # Type definitions
├── detectGrammar.ts       # Detection logic
├── parseSlash.ts          # Slash parser
├── parseMention.ts        # Mention parser
├── parseHashtag.ts        # Hashtag parser
├── resolveIntent.ts       # Grammar → intent
├── grammarToCommand.ts    # Intent → command
├── index.ts               # Clean exports
└── README.md              # This file
```

## Usage Examples

### Example 1: Detect Grammar

```typescript
import { detectGrammar } from './input';

const text = "Let's use /template Task for this";
const context = {
  nodeId: 'node-123',
  cursorOffset: 15, // Inside "/template"
  documentId: 'doc-1',
  workspaceId: 'work-1',
};

const result = detectGrammar(text, context);

if (result.active) {
  console.log(result.grammar);
  // {
  //   type: 'slash',
  //   keyword: 'template',
  //   args: ['Task'],
  //   range: { from: 10, to: 23 }
  // }
}
```

### Example 2: Resolve Intent

```typescript
import { resolveIntent } from './input';

const grammar = {
  type: 'hashtag',
  key: 'status',
  value: 'done',
  range: { from: 0, to: 12 },
  raw: '#status done',
};

const resolution = resolveIntent(grammar, context);
// {
//   grammar: {...},
//   candidates: [
//     {
//       commandType: 'prop.set',
//       confidence: 'high',
//       reason: 'Set property',
//       params: { nodeId: 'node-123', key: 'status', value: 'done' }
//     }
//   ]
// }
```

### Example 3: Convert to Command

```typescript
import { getBestCommand } from './input';

const command = getBestCommand(resolution);
// {
//   type: 'prop.set',
//   payload: {
//     nodeId: 'node-123',
//     key: 'status',
//     value: 'done'
//   }
// }
```

### Example 4: Handle Ambiguity

```typescript
import { resolveIntent, hasAmbiguity } from './input';

const grammar = {
  type: 'mention',
  subtype: 'document',
  identifier: 'Inbox',
  // ...
};

const resolution = resolveIntent(grammar, context);

if (hasAmbiguity(resolution)) {
  // Multiple high-confidence candidates
  // Show picker to user
  showCommandPicker(resolution.candidates);
} else {
  // Single clear intent
  const command = getBestCommand(resolution);
  executeCommand(command);
}
```

## Testing Strategy

All functions are pure. Easy to test:

```typescript
import { parseSlash } from './input';

test('parses slash command with args', () => {
  const result = parseSlash('/template Task', { from: 0, to: 14 });

  expect(result).toEqual({
    type: 'slash',
    keyword: 'template',
    args: ['Task'],
    range: { from: 0, to: 14 },
    raw: '/template Task',
  });
});
```

No mocks. No setup. Just input → output.

## Phase B Exit Criteria

✅ Typing `/`, `@`, `#` produces grammar objects  
✅ Grammar deterministically maps to command objects  
✅ Ambiguity produces multiple candidates  
✅ No editor state is touched  
✅ No UI assumptions exist

## What's NOT Here

❌ No menus  
❌ No styling  
❌ No execution  
❌ No cursor movement  
❌ No mutation

Those come in Phase C (Dispatch & UI Integration).

## Next Phase

**Phase C: Dispatch & UI Integration**

- Wire detection to editor input events
- Show autocomplete UI
- Execute selected commands
- Handle keyboard shortcuts

Very small phase. Most work is done.
