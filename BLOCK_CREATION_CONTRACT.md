# Block Creation Contract

**Status:** ✅ Enforced (Manual + ESLint Ready)  
**Last Updated:** 2026-01-21

This document defines the architectural contract for creating blocks in the Clutter editor.

---

## 🔒 **THE GOLDEN RULE**

**ALL block creation MUST go through centralized creation functions.**

❌ **NEVER** call `schema.nodes.X.create()` directly  
✅ **ALWAYS** use `createBlockNode()` or `createCleanBlockAttrs()`

---

## 📚 **The Three Creation Functions**

### 1️⃣ `createBlockNode()` - Primary Creation Path

**Use when:** Creating a NEW block from scratch

```typescript
import { createBlockNode } from '../domain/createBlock';

// ✅ Creating a new paragraph
const para = createBlockNode(schema, {
  type: 'paragraph',
  indent: 0,
});

// ✅ Creating a heading with content
const heading = createBlockNode(schema, {
  type: 'heading',
  headingLevel: 2,
  indent: 1,
  content: existingFragment,
});

// ✅ Creating a task list item
const task = createBlockNode(schema, {
  type: 'listBlock',
  listType: 'task',
  checked: false,
});
```

**What it does:**

- ✅ Generates new `blockId` (crypto.randomUUID())
- ✅ Sets default `indent` (0)
- ✅ Sets default `collapsed` (false)
- ✅ Applies type-specific defaults
- ✅ Type-safe via TypeScript generics

---

### 2️⃣ `createCleanBlockAttrs()` - Cloning Existing Blocks

**Use when:** Creating a NEW block based on an EXISTING block's attributes

```typescript
import { createCleanBlockAttrs } from '../domain/createBlock';

// ✅ Creating a sibling with same type
const cleanAttrs = createCleanBlockAttrs(node, node.attrs.indent);
tr.insert(pos, node.type.create(cleanAttrs));

// ✅ Creating a child (indent + 1)
const childAttrs = createCleanBlockAttrs(node, node.attrs.indent + 1);
tr.insert(pos, node.type.create(childAttrs));
```

**What it does:**

- ✅ Generates **NEW** `blockId` (never reuses old ID!)
- ✅ Whitelists only structural attributes:
  - `blockId` (new)
  - `indent` (explicit parameter)
  - `listType` (if present)
  - `calloutType` (if present)
- ❌ **Filters out** transient state:
  - `collapsed` (NOT copied)
  - `checked` (NOT copied)
  - `tags` (NOT copied)

**Why separate from createBlockNode?**

- Performance: Avoids type checking when you already know the node type
- Flexibility: Works with any node type dynamically
- Legacy: Used in keyboard handlers where node type is runtime-determined

---

### 3️⃣ `updateBlockAttrs()` - Updating Existing Blocks

**Use when:** Modifying attributes of an EXISTING block

```typescript
import { updateBlockAttrs } from '../domain/updateBlockAttrs';

// ✅ Changing indent
updateBlockAttrs(tr, blockPos, { indent: 2 });

// ✅ Toggling collapse
updateBlockAttrs(tr, blockPos, { collapsed: true });

// ❌ NEVER pass blockId (will throw error!)
updateBlockAttrs(tr, blockPos, { blockId: newId }); // 💥 Error!
```

**What it does:**

- ✅ Updates ONLY the specified attributes
- ✅ Preserves existing `blockId` (immutable!)
- ✅ Validates that `blockId` is not changed
- 🔒 Throws error if you try to change `blockId`

---

## ❌ **ANTI-PATTERNS (DO NOT USE)**

### ❌ Manual .create() Calls

```typescript
// ❌ BAD: Bypasses blockId assignment
state.schema.nodes.paragraph.create({ indent: 0 });

// ❌ BAD: Creates temporal identity gap
schema.nodes['heading'].create({ headingLevel: 2 });

// ❌ BAD: Relies on BlockIdGenerator as primary mechanism
tr.replaceWith(pos, pos + size, schema.nodes.paragraph.create({}));
```

**Why this is wrong:**

- No `blockId` assigned at creation time
- Creates temporal identity gap (block exists without ID)
- Race conditions with BlockIdGenerator
- Violates "eager assignment" invariant
- Breaks undo/redo, references, any feature tracking blocks by ID

---

### ❌ Passing blockId to updateBlockAttrs()

```typescript
// ❌ BAD: Trying to change block identity
const cleanAttrs = createCleanBlockAttrs(node, newIndent);
updateBlockAttrs(tr, blockPos, cleanAttrs); // 💥 Contains blockId!
```

**Why this is wrong:**

- `blockId` is **immutable** after creation
- Changing it breaks references, undo/redo, persistence
- `updateBlockAttrs()` enforces this with a runtime error

**The fix:**

```typescript
// ✅ GOOD: Pass only changed attributes
updateBlockAttrs(tr, blockPos, { indent: newIndent });
```

---

### ❌ Using createCleanBlockAttrs() to Update Existing Blocks

```typescript
// ❌ BAD: Generates NEW blockId for existing block
const cleanAttrs = createCleanBlockAttrs(node, node.attrs.indent - 1);
updateBlockAttrs(tr, blockPos, cleanAttrs);
```

**Why this is wrong:**

- `createCleanBlockAttrs()` is for **NEW** blocks (generates new ID)
- Passing it to `updateBlockAttrs()` will throw error
- Violates "blockId immutability" invariant

**The fix:**

```typescript
// ✅ GOOD: Pass delta only
updateBlockAttrs(tr, blockPos, { indent: node.attrs.indent - 1 });
```

---

## 🔍 **Function Decision Tree**

```
Are you creating a NEW block or updating EXISTING?
│
├─ NEW BLOCK
│  │
│  ├─ Do you know the type at compile time?
│  │  ├─ YES → Use createBlockNode() ✅
│  │  └─ NO → Use createCleanBlockAttrs() ✅
│  │
│  └─ Do you have a source block to clone from?
│     ├─ YES → Use createCleanBlockAttrs() ✅
│     └─ NO → Use createBlockNode() ✅
│
└─ EXISTING BLOCK
   └─ Use updateBlockAttrs() ✅
      (Never include blockId in attrs!)
```

---

## 🧪 **Enforcement Layers**

### 1️⃣ TypeScript Types

- `createBlockNode()` enforces type-specific attributes via generics
- `CreateBlockOptions<T>` prevents invalid attribute combinations

### 2️⃣ Runtime Validation

- `updateBlockAttrs()` throws error if `blockId` is passed
- `assertAllBlocksHaveIds()` validates document structure (dev mode)

### 3️⃣ ESLint Rules (When Enabled)

- `no-manual-block-create` - Prevents manual `.create()` calls
- Catches violations at CI/build time

### 4️⃣ Code Review

- PR checklist includes block creation pattern review
- Architecture docs linked from CONTRIBUTING.md

---

## 📊 **Common Scenarios**

### Scenario 1: Enter Key Creates Sibling

```typescript
// ❌ OLD (Before fixes)
const newNode = state.schema.nodes.paragraph.create({
  indent: node.attrs.indent,
});
tr.insert(pos, newNode);

// ✅ NEW (After fixes)
const newNode = createBlockNode(state.schema, {
  type: 'paragraph',
  indent: node.attrs.indent,
});
tr.insert(pos, newNode);
```

---

### Scenario 2: Tab Key Indents Block

```typescript
// ✅ CORRECT: Updating existing block
import { setBlockIndent } from '../domain/indentOperations';

setBlockIndent(tr, blockPos, newIndent);
// Internally calls updateBlockAttrs(tr, blockPos, { indent: newIndent })
```

---

### Scenario 3: Slash Command Converts Block

```typescript
// ✅ CORRECT: Create new block, replace old one
const replacement = createBlockNode(state.schema, {
  type: 'listBlock',
  listType: 'task',
  checked: false,
  indent: currentBlock.attrs.indent, // Preserve indent
  content: currentBlock.content, // Preserve content
});

replaceBlock(view, blockStart, blockEnd, replacement);
```

---

### Scenario 4: Toggle Creates Child

```typescript
// ✅ CORRECT: Always use createBlockNode for toggle children
const paragraphNode = createBlockNode(state.schema, {
  type: 'paragraph',
  indent: parentIndent + 1,
  tags: [],
});
tr.insert(insertPos, paragraphNode);
```

---

## 🚨 **Emergency Exceptions**

**Very rarely**, you may need to call `.create()` directly for:

- ProseMirror internal operations (e.g., schema migrations)
- Testing/debugging low-level behavior
- Third-party plugin integration

**When you must use manual .create():**

```typescript
// eslint-disable-next-line no-manual-block-create
// JUSTIFICATION: Testing low-level ProseMirror transform behavior
const testNode = schema.nodes.paragraph.create({ blockId: 'test-123' });
```

**Requirements:**

- ✅ Must include `eslint-disable-next-line` comment
- ✅ Must include justification comment
- ✅ Must manually ensure `blockId` is assigned
- ✅ Requires extra scrutiny in code review

---

## 📚 **Related Documentation**

- `packages/editor/domain/createBlock.ts` - Source code + detailed JSDoc
- `packages/editor/domain/updateBlockAttrs.ts` - Update function source
- `.eslint-local/rules/no-manual-block-create.js` - ESLint rule implementation
- `ARCHITECTURE.md` - Overall editor architecture
- `packages/editor/plugins/keyboard/ARCHITECTURE.md` - Keyboard handler contracts

---

## 🔄 **Migration Guide (If You Find Old Code)**

### Before (❌ Manual .create())

```typescript
tr.insert(pos, state.schema.nodes.paragraph.create({ indent: 0 }));
```

### After (✅ createBlockNode)

```typescript
tr.insert(
  pos,
  createBlockNode(state.schema, {
    type: 'paragraph',
    indent: 0,
  })
);
```

---

## ✅ **Verification Checklist**

When reviewing block creation code, verify:

- [ ] No manual `.create()` calls (unless explicitly excepted)
- [ ] All new blocks use `createBlockNode()` or `createCleanBlockAttrs()`
- [ ] Existing block updates use `updateBlockAttrs()` only
- [ ] No `blockId` passed to `updateBlockAttrs()`
- [ ] `createCleanBlockAttrs()` generates NEW ID (not reused)
- [ ] Selection is set after document-changing transactions

---

## 🎯 **Summary**

| Goal                  | Function                  | When                           |
| --------------------- | ------------------------- | ------------------------------ |
| Create new block      | `createBlockNode()`       | Know type at compile time      |
| Clone existing block  | `createCleanBlockAttrs()` | Runtime type, copy structure   |
| Update existing block | `updateBlockAttrs()`      | Modify indent, collapsed, etc. |
| ❌ Manual .create()   | **NEVER**                 | Bypasses blockId assignment    |

**Remember:** blockId is assigned **EAGERLY** at creation, **NEVER** lazily. BlockIdGenerator is a safety net, not the primary mechanism.

---

**Questions?** See `packages/editor/domain/createBlock.ts` for detailed implementation.
