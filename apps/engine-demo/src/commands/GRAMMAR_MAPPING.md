# Input Grammar → Command Mapping

**Preview for Phase B: Input Grammar & Dispatch**

This document shows how different input methods map to the same underlying commands.

## Core Insight

Three different syntaxes → Same command → Same mutation

```
/indent     →  { type: 'node.indent', ... }
Button      →  { type: 'node.indent', ... }
Cmd+]       →  { type: 'node.indent', ... }
```

## Slash Commands (`/`)

Explicit action invocations.

| Input               | Command          | Payload                             |
| ------------------- | ---------------- | ----------------------------------- |
| `/create`           | `node.create`    | `{ parentId, afterId }`             |
| `/delete`           | `node.delete`    | `{ nodeId }`                        |
| `/indent`           | `node.indent`    | `{ nodeId }`                        |
| `/outdent`          | `node.outdent`   | `{ nodeId }`                        |
| `/move`             | `node.move`      | `{ nodeId, newParentId, afterId }`  |
| `/template meeting` | `template.apply` | `{ nodeId, templateId: 'meeting' }` |
| `/save`             | `system.saveNow` | -                                   |

## @Mentions

Create references by mentioning nodes.

| Input                 | Command   | Payload                                         |
| --------------------- | --------- | ----------------------------------------------- |
| `@TaskNode`           | `ref.add` | `{ fromNodeId, to: { type: 'local', nodeId } }` |
| `@workspace:doc:Node` | `ref.add` | `{ fromNodeId, to: { type: 'external', ... } }` |

**Parsing logic**:

1. Detect `@` character
2. Parse node identifier (local or external syntax)
3. Find referenced node
4. Generate `ref.add` command

## #Hashtags

Set properties inline.

| Input            | Command    | Payload                                      |
| ---------------- | ---------- | -------------------------------------------- |
| `#status:done`   | `prop.set` | `{ nodeId, key: 'status', value: 'done' }`   |
| `#priority:high` | `prop.set` | `{ nodeId, key: 'priority', value: 'high' }` |
| `#tag`           | `prop.set` | `{ nodeId, key: 'tag', value: '' }`          |

**Parsing logic**:

1. Detect `#` character
2. Parse `key:value` or just `key`
3. Generate `prop.set` command

## Keyboard Shortcuts

Direct command invocation.

| Shortcut            | Command        | Payload                      |
| ------------------- | -------------- | ---------------------------- |
| `Enter`             | `node.create`  | `{ parentId, afterId }`      |
| `Backspace` (empty) | `node.delete`  | `{ nodeId }`                 |
| `Tab`               | `node.indent`  | `{ nodeId }`                 |
| `Shift+Tab`         | `node.outdent` | `{ nodeId }`                 |
| `Cmd/Ctrl+Z`        | _(undo)_       | _(reverses last command)_    |
| `Cmd/Ctrl+Shift+Z`  | _(redo)_       | _(reapplies undone command)_ |

## Button/Menu Actions

UI elements invoke commands directly.

```tsx
<button
  onClick={() =>
    executeCommand(
      {
        type: 'node.indent',
        payload: { nodeId: activeNodeId },
      },
      context
    )
  }
>
  Indent
</button>
```

## Complex Operations (Multi-Command)

Some UI actions batch multiple commands:

### "Convert to Task"

```typescript
executeCommandBatch(
  [
    { type: 'prop.set', payload: { nodeId, key: 'type', value: 'task' } },
    { type: 'prop.set', payload: { nodeId, key: 'status', value: 'todo' } },
    { type: 'prop.set', payload: { nodeId, key: 'priority', value: 'normal' } },
  ],
  context
);
```

### "Merge with Next"

```typescript
executeCommandBatch(
  [
    {
      type: 'node.replaceText',
      payload: { nodeId: current, from: end, to: end, text: next.text },
    },
    { type: 'node.delete', payload: { nodeId: next.id } },
  ],
  context
);
```

## Sync Operations (Future)

Remote changes arrive as commands:

```json
{
  "type": "node.insertText",
  "payload": {
    "nodeId": "abc-123",
    "offset": 42,
    "text": "remote edit"
  },
  "metadata": {
    "timestamp": 1706825400000,
    "source": "sync",
    "userId": "user-xyz"
  }
}
```

Same executor. Same mutations. No special cases.

## Phase B Implementation Plan

1. **Parser Layer**
   - Detect `/@/#` syntax in text
   - Extract identifiers and parameters
   - Look up referenced entities
   - Generate commands

2. **Dispatch Layer**
   - Validate commands
   - Execute via `executeCommand()`
   - Handle results (success/error/noop)

3. **UI Integration**
   - Real-time syntax highlighting for `/@/#`
   - Autocomplete for node references
   - Visual feedback for command execution
   - Error messages for invalid syntax

4. **Batching Strategy**
   - Group related commands in single undo unit
   - Debounce rapid text edits
   - Preserve command order for sync

## Next Steps

Ready for Phase B: Build the parsers that turn user input into commands.
