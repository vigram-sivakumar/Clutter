# 📦 Module Reference Guide

**Quick lookup:** Where does X live? What should I call?

---

## 🔍 "I need to..." → "Call this..."

### Text & Content Operations

| I need to... | Function | Module | Example |
|--------------|----------|--------|---------|
| Split text at cursor | `splitNode()` | NodeKernel | `const [before, after] = splitNode(node, cursor)` |
| Merge two nodes | `mergeNodes()` | NodeKernel | `const merged = mergeNodes(upper, lower)` |
| Create new node | `createNode()` | NodeKernel | `const node = createNode('paragraph', 'text')` |
| Update node text | `replaceNode()` | NodeKernel | `replaceNode(nodes, id, {...node, text: 'new'})` |

**Note:** After File 06.2, `cursor` is `{ nodeId, offset, bias }` (see File 06.2)

### Metadata Operations

| I need to... | Function | Module | Example |
|--------------|----------|--------|---------|
| Insert reference/mention | `insertMeta()` | InlineMetadata | `insertMeta(node, {type: 'reference', targetId: 'X'}, 10)` |
| Delete metadata | `deleteMeta()` | InlineMetadata | `deleteMeta(node, offset)` |
| Delete by index | `deleteMetaByIndex()` | InlineMetadata | `deleteMetaByIndex(node, 2)` |
| Adjust offsets (typing) | `adjustMetaOffsets()` | InlineMetadata | `adjustMetaOffsets(node, start, end, newLen)` |
| Find metadata at position | `getMetaAtOffset()` | InlineMetadata | `getMetaAtOffset(node, 5)` |
| Find metadata before cursor | `getMetaBeforeOffset()` | InlineMetadata | `getMetaBeforeOffset(node, 10)` |
| Find metadata after cursor | `getMetaAfterOffset()` | InlineMetadata | `getMetaAfterOffset(node, 10)` |

### Rendering

| I need to... | Function | Module | Example |
|--------------|----------|--------|---------|
| Render node with metadata | `projectMetaToDOM()` | InlineMetadata | `const content = projectMetaToDOM(node, resolveLabel)` |
| Resolve metadata label | Custom callback | Your code | `(meta) => lookupTitle(meta.targetId)` |

### ID Generation

| I need to... | Function | Module | Example |
|--------------|----------|--------|---------|
| Generate node ID | `generateNodeId()` | NodeKernel | `const id = generateNodeId()` // Returns 'node-123' |
| ❌ Use nanoid | DON'T | N/A | Use `generateNodeId()` instead |

### Node Properties

| I need to... | Function | Module | Example |
|--------------|----------|--------|---------|
| Get variant | `getNodeVariant()` | NodeKernel | `const variant = getNodeVariant(node)` |
| Set variant | `setNodeVariant()` | NodeKernel | `const updated = setNodeVariant(node, 'heading-1')` |

### Array Operations

| I need to... | Function | Module | Example |
|--------------|----------|--------|---------|
| Insert node after | `insertNodeAfter()` | NodeKernel | `insertNodeAfter(nodes, afterId, newNode)` |
| Insert node before | `insertNodeBefore()` | NodeKernel | `insertNodeBefore(nodes, beforeId, newNode)` |
| Delete node | `deleteNode()` | NodeKernel | `deleteNode(nodes, nodeId)` |
| Replace node | `replaceNode()` | NodeKernel | `replaceNode(nodes, id, newNode)` |
| Find node | Standard JS | N/A | `nodes.find(n => n.id === id)` |

---

## 🗂️ Module Responsibilities

### InlineMetadata.ts
**What it does:** ALL inline metadata operations (offsets, split, merge, render)

**Owns:**
- Offset calculation & adjustment
- Metadata split/merge logic
- DOM projection (rendering)
- Metadata queries

**Exports:**
```typescript
splitWithMeta(node, offset, newId)
mergeWithMeta(upper, lower)
insertMeta(node, meta, offset)
deleteMeta(node, offset)
deleteMetaByIndex(node, index)
adjustMetaOffsets(node, editStart, editEnd, newLength)
projectMetaToDOM(node, resolveLabel)
getMetaAtOffset(node, offset)
getMetaBeforeOffset(node, offset)
getMetaAfterOffset(node, offset)
hasMeta(node)
countMeta(node)
```

**Never calls:** Anything outside itself (pure functions)

---

### NodeKernel.ts
**What it does:** Node-level operations (thin wrappers over InlineMetadata for metadata operations)

**Owns:**
- Node creation
- ID generation
- Node-level split/merge (wraps InlineMetadata)
- Node array operations
- Variant management

**Exports:**
```typescript
createNode(type, text, parentId)
generateNodeId()
splitNode(node, offset)          // Wraps splitWithMeta
mergeNodes(first, second)         // Wraps mergeWithMeta
insertNodeAfter(nodes, afterId, newNode)
insertNodeBefore(nodes, beforeId, newNode)
deleteNode(nodes, nodeId)
replaceNode(nodes, id, newNode)
getNodeVariant(node)
setNodeVariant(node, variant)
```

**Calls:** `InlineMetadata` functions for split/merge

---

### NodeView.tsx
**What it does:** Renders a single node (pure projection, no logic)

**Owns:**
- DOM structure (`node__indent`, `node__row`, `node__marker`, `node__content`)
- Variant styling
- DOM normalization (removes illegal block elements)

**Calls:**
- `projectMetaToDOM()` from InlineMetadata
- `getNodeVariant()` from NodeKernel

**Never:** Manipulates metadata, calculates offsets, or implements rendering logic

---

### NodeEditor.tsx
**What it does:** Event handling (thin wrappers, orchestration only)

**Owns:**
- Keyboard event handlers
- Input event handlers
- Editor state management
- Caret placement

**Calls:**
- `splitNode()` from NodeKernel (Enter key)
- `mergeNodes()` from NodeKernel (Backspace via EditorState)
- `adjustMetaOffsets()` from InlineMetadata (input events)
- `extractPureText()` utility

**Never:** Implements split/merge logic, calculates offsets, or manipulates metadata directly

---

### EditorState.ts
**What it does:** State transformations (intents → new state)

**Owns:**
- `applyIntent()` function
- Intent types (enter, backspace, arrow keys)

**Calls:**
- `splitNode()` from NodeKernel
- `mergeNodes()` from NodeKernel

**Never:** Implements node operations, just orchestrates them

---

## 🎯 Common Scenarios

### Scenario 1: User presses Enter

```typescript
// NodeEditor.tsx
if (e.key === 'Enter') {
  e.preventDefault();
  
  // 1. Get current node & offset
  const activeNode = nodes.find(n => n.id === activeNodeId);
  
  // 2. Split using NodeKernel (which uses InlineMetadata)
  const [before, after] = splitNode(activeNode, offset);
  
  // 3. Update state
  const updatedNodes = replaceNode(nodes, activeNode.id, before);
  const finalNodes = insertNodeAfter(updatedNodes, before.id, after);
  
  // 4. Commit
  commit({ nodes: finalNodes, activeNodeId: after.id, offset: 0 });
}
```

**What happened:**
- `NodeEditor` handled the event (thin)
- `splitNode()` did the work
- `splitNode()` called `splitWithMeta()` internally
- `splitWithMeta()` handled text + metadata splitting

---

### Scenario 2: User types text (metadata present)

```typescript
// NodeEditor.tsx - input handler
const handleInput = (e) => {
  const oldNode = nodes.find(n => n.id === nodeId);
  const newText = extractPureText(target);
  
  // 1. Calculate edit range
  const editStart = findCommonPrefix(oldNode.text, newText);
  const editEnd = findCommonSuffix(oldNode.text, newText);
  const newLength = calculateNewLength(editStart, editEnd, newText);
  
  // 2. Adjust metadata offsets using InlineMetadata
  const updatedNode = adjustMetaOffsets(oldNode, editStart, editEnd, newLength);
  updatedNode.text = newText;
  
  // 3. Update state
  setEditorState({ ...state, nodes: replaceNode(nodes, nodeId, updatedNode) });
};
```

**What happened:**
- `NodeEditor` extracted text and calculated edit range
- `adjustMetaOffsets()` updated all metadata offsets
- No manual offset calculation

---

### Scenario 3: Render node with references

```typescript
// NodeView.tsx
function NodeView({ node }) {
  // 1. Resolve labels for metadata
  const resolveLabel = (meta) => {
    return `@${meta.targetId}`;  // Or lookup actual title
  };
  
  // 2. Project to DOM using InlineMetadata
  const content = projectMetaToDOM(node, resolveLabel);
  
  // 3. Render (pure projection)
  return (
    <div className="node__content" contentEditable>
      {content}
    </div>
  );
}
```

**What happened:**
- `NodeView` just called `projectMetaToDOM()`
- No manual DOM manipulation
- No span creation
- Pure projection

---

### Scenario 4: Insert a reference at cursor

```typescript
// NodeEditor.tsx - hypothetical reference insertion
const insertReference = (nodeId, targetId, offset) => {
  const node = nodes.find(n => n.id === nodeId);
  
  // Use InlineMetadata to insert
  const updated = insertMeta(
    node,
    { type: 'reference', targetId },
    offset
  );
  
  // Update state
  commit({ 
    nodes: replaceNode(nodes, nodeId, updated),
    activeNodeId: nodeId,
    offset: offset  // Caret stays at insertion point
  });
};
```

**What happened:**
- `insertMeta()` handled the insertion
- No manual array manipulation
- Offsets automatically sorted

---

## ❌ Anti-Patterns (Don't Do This)

### Anti-Pattern 1: Manual Split
```typescript
// ❌ BAD - Duplicating split logic
function handleEnter() {
  const before = { ...node, text: node.text.substring(0, offset) };
  const after = { id: generateNodeId(), text: node.text.substring(offset) };
}

// ✅ GOOD
function handleEnter() {
  const [before, after] = splitNode(node, offset);
}
```

### Anti-Pattern 2: Manual Offset Adjustment
```typescript
// ❌ BAD - Calculating offsets manually
node.meta.forEach(m => {
  if (m.offset > editStart) {
    m.offset += delta;
  }
});

// ✅ GOOD
const updated = adjustMetaOffsets(node, editStart, editEnd, newLength);
```

### Anti-Pattern 3: Manual Rendering
```typescript
// ❌ BAD - Creating spans manually
const span = document.createElement('span');
span.className = 'inline-meta';
span.textContent = targetId;
contentEl.appendChild(span);

// ✅ GOOD
const content = projectMetaToDOM(node, resolveLabel);
```

### Anti-Pattern 4: Custom ID Generation
```typescript
// ❌ BAD
import { nanoid } from 'nanoid';
const id = nanoid();

// ✅ GOOD
const id = generateNodeId();
```

---

## 🔒 Enforcement Checklist

Before committing code, verify:

- [ ] No duplicate split/merge logic
- [ ] No manual offset calculations
- [ ] No direct nanoid usage
- [ ] No manual DOM manipulation for metadata
- [ ] All node operations use NodeKernel functions
- [ ] All metadata operations use InlineMetadata functions
- [ ] Event handlers are thin (< 10 lines of logic)

---

**Last Updated:** 2026-02-07  
**See also:** ARCHITECTURE.md for detailed rules
