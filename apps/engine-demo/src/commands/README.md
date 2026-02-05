# Phase A — Command Model

## Purpose

The command model is the **canonical mutation surface** for the entire editor. It defines the closed set of all possible state changes.

## Core Principle

> **If something changes data, it must be a command.**
>
> **If it's not a command, it must not mutate state.**

This is how undo, sync, and UI freedom stay intact.

## What This Enables

After defining commands, all of these become **different ways to invoke the same commands**:

- Slash commands (`/create`, `/indent`)
- @mentions (`@NodeName` → `ref.add`)
- #hashtags (`#status:done` → `prop.set`)
- Buttons and menus
- Keyboard shortcuts
- Undo/redo operations
- Sync operations from remote
- API integrations

## Command Categories

### 1. Node Content Commands

Granular text operations for precise undo:

- `node.insertText` - Insert text at offset
- `node.deleteText` - Delete text range
- `node.replaceText` - Replace text range

### 2. Structure (Tree) Commands

Parent/child relationships:

- `node.create` - Create new node
- `node.delete` - Soft delete node (Phase 13 invariant)
- `node.indent` - Make child of previous sibling
- `node.outdent` - Promote to parent's level
- `node.move` - Move to new position

### 3. Reference (Graph) Commands

Knowledge graph relationships:

- `ref.add` - Add reference (supports local + external)
- `ref.remove` - Remove reference

**Note**: Backlinks are derived, never commanded.

### 4. Properties & Metadata Commands

Powers #hashtags, queries, templates:

- `prop.set` - Set property (no schema enforcement)
- `prop.remove` - Remove property

### 5. Template Commands

Templates are applied, never enforced:

- `template.apply` - Apply template to node

### 6. Document Commands

Multi-document operations:

- `document.create` - Create new document
- `document.rename` - Rename document
- `document.delete` - Delete document
- `document.switch` - Switch active document (navigation, not mutation)

### 7. Workspace Commands

Cross-workspace operations (UI comes later):

- `workspace.create` - Create workspace
- `workspace.switch` - Switch workspace
- `workspace.duplicateExternalNode` - Copy node from external workspace

### 8. System Commands

Explicit user intent (not autosave):

- `system.saveNow` - Force save
- `system.bindLocation` - Choose save location
- `system.retrySave` - Retry failed save

## Architecture

```
Input Grammar (slash/@/#)
    ↓
Command Dispatch
    ↓
Command Executor
    ↓
Editor Primitives (NodeEditor)
    ↓
Engine (NodeKernel + EditorState)
```

## Design Decisions

### No "merge" command

Merges are composed of primitive commands:

1. `node.replaceText` (append text)
2. `node.delete` (remove merged node)
3. `ref.add` (preserve references)

### Soft deletes only

`node.delete` is always soft (Phase 13 invariant). Hard deletion is not a command.

### Properties are strings

No schema enforcement at command level. Validation is UI-level concern.

### Undo doesn't track navigation

`document.switch` and `workspace.switch` are not undoable.

## Command Batching

Related commands can be batched into a single undo unit:

```typescript
executeCommandBatch([
  { type: 'node.insertText', payload: { ... } },
  { type: 'prop.set', payload: { ... } },
], context);
```

## Future: Sync

When sync is implemented, remote commands will flow through the same executor:

```
Remote Change → Command → Executor → Local State
```

No special-case logic. Commands are the universal mutation protocol.

## What's Next

**Phase B: Input Grammar & Dispatch**

Define how user input maps to commands:

- Slash syntax → which command
- @mention syntax → which command
- #hashtag syntax → which command

Zero UI, pure parsing.
