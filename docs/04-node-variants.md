# Node Variants & Design System Contract

> **⚠️ HISTORICAL REFERENCE — DATA MODEL UPDATED**
> 
> **Architecture Status:** Node types still valid, data structure changed  
> **Node Variants:** ✅ Still Valid (paragraph, heading, task, etc.)  
> **Data Structure:** ❌ Outdated (now uses segments)
> 
> **Current Architecture:** See [`architecture/MANIFEST.md`](./architecture/MANIFEST.md)
>
> This document describes node types and variants (still valid), but references **old data structure**.
>
> **Deprecated patterns in this file:**
> - `node.text` field → Use `getPlainText(node.segments)`
> - `node.meta` field → Inline elements are segments
> - Direct text manipulation → Use SegmentedEditor API
>
> **Node types (paragraph, task, heading, etc.) remain valid and unchanged.**

---

**Original Status**: LOCKED  
**Depends on**: File 03 — Keyboard Interaction Truth Table  
**Scope**: UI + semantic model only (engine unchanged)

---

## 1. Core Principle

A node is always a node.

Lists, bullets, tasks, headings, callouts are visual + semantic **variants** of the same node, not different structures.

There is:

- ❌ No separate list container
- ❌ No block wrapper hierarchy
- ❌ No variant-specific engine logic

Everything is:

- One node
- One text field
- One parentId
- One variant

---

## 2. Variant Model (Data & UI)

### 2.1 Variant Persistence (DECISION LOCKED)

Variants are semantic and persistent.

They are stored as:

```typescript
node.props.variant: string
```

**Examples:**

```typescript
variant: 'paragraph'; // default
variant: 'bullet';
variant: 'task';
variant: 'heading-1';
variant: 'heading-2';
variant: 'callout';
variant: 'numbered';
```

**Why this is locked:**

- Variants must survive reload
- Variants must sync
- Variants are not styling accidents

---

## 3. Rendering Contract (DOM + CSS)

### 3.1 DOM Shape (ALL variants)

```html
<div class="node node--task">
  <div class="node__indent"></div>
  <div class="node__marker"></div>
  <div class="node__content" contenteditable>Node text here</div>
</div>
```

### 3.2 CSS Is the Only Visual Differentiator

Variants map 1:1 to CSS classes:

| Variant   | CSS Class          |
| --------- | ------------------ |
| paragraph | `.node--paragraph` |
| bullet    | `.node--bullet`    |
| task      | `.node--task`      |
| numbered  | `.node--numbered`  |
| heading-1 | `.node--h1`        |
| heading-2 | `.node--h2`        |
| callout   | `.node--callout`   |

**JS never checks variant to decide behavior.**  
**CSS alone controls appearance.**

---

## 4. Variant Creation Rules

### 4.1 Explicit Creation (Primary)

Variants are created via:

- Slash commands (`/task`, `/h1`, `/callout`)
- Command palette
- UI controls (buttons, menus)

### 4.2 Markdown Shortcuts (Secondary, Consumed)

Markdown prefixes trigger variant change and are **removed**.

| Input     | Result    |
| --------- | --------- |
| `- text`  | bullet    |
| `[] text` | task      |
| `# text`  | heading-1 |
| `## text` | heading-2 |
| `> text`  | callout   |

**Important:**

- Prefix is removed from text
- Variant is persisted in `node.props.variant`
- Markdown is not kept visible
- This matches slash-command semantics

**Markdown is intent, not content.**

---

## 5. Variant Stickiness (CRITICAL RULE)

Variants are **sticky** across all node creation operations.

This applies to:

- Enter
- Split (Enter in middle)
- Undo / redo
- Duplicate
- Paste

### 5.1 Enter Behavior (Aligned with File 03)

| Cursor Position | Result                              |
| --------------- | ----------------------------------- |
| Start           | Sibling ABOVE, **same variant**     |
| Middle          | Split → **both nodes same variant** |
| End / empty     | Sibling BELOW, **same variant**     |

**Never auto-convert to paragraph.**

---

## 6. Backspace Behavior (LOCKED)

### 6.1 Backspace on Empty Node

**Deletes the node. Nothing else.**

- ❌ No outdent
- ❌ No variant conversion
- ❌ No merge-as-special-case
- ❌ No fallback paragraph

Cursor moves to:

- End of previous visible node
- Variant preserved

**This rule applies to all variants, including headings and tasks.**

---

## 7. Variant Does NOT Affect Keyboard Logic

Variants **never** change:

- Enter behavior
- Backspace behavior
- Tab / Shift+Tab behavior
- Arrow navigation

**All keyboard logic is global and defined in File 03.**

Variants **only** affect:

- Marker rendering
- Typography
- Decorations (checkbox, number, callout bar)

---

## 8. Variant-Specific UI Elements (Pure UI)

Examples:

- `.node--task` shows checkbox
- `.node--numbered` shows index
- `.node--callout` shows vertical bar
- `.node--heading-*` changes font size/weight

These are:

- Render-only
- No data mutations
- No behavior branching

---

## 9. What We Explicitly Do NOT Support

❌ Nested list types  
❌ Mixed variants in same node  
❌ Implicit variant downgrade  
❌ Auto outdent on backspace  
❌ Variant inference from hierarchy  
❌ Variant stored in text

---

## 10. Mental Model (Final)

**Workflowy truth, Tana flexibility, zero ambiguity**

- A bullet is a node
- A task is a node
- A heading is a node
- A list is just nodes with a class
- Hierarchy is orthogonal
- Behavior is invariant
- Design is centralized

---

## 🔒 Lock Statement

This file is **canonical**.

Any future implementation that:

- Changes variant on Enter
- Converts variant on Backspace
- Treats lists as structural containers
- Stores variant in text

…is **incorrect by definition**.

---

## Implementation Notes

Current codebase status:

- `NodeKernel.ts` currently has `type: 'paragraph' | 'heading'`
- Must migrate to `props.variant: string` for full spec compliance
- Existing variants (paragraph, heading) map cleanly
- New variants (bullet, task, numbered, callout) require implementation

This spec must be implemented before visual design begins.

---

**Next**: File 05 — Node Anatomy & Layout Grid (indent, marker, content slots)
