# Complete Blocks Reference - Clutter Editor

**Last Updated:** 2026-01-29  
**Purpose:** Complete documentation of all block types, attributes, and behavior for redesign

---

## 📋 Table of Contents

1. [Block Architecture Overview](#block-architecture-overview)
2. [Common Attributes (All Blocks)](#common-attributes-all-blocks)
3. [Block Types](#block-types)
   - [Paragraph](#1-paragraph)
   - [Heading](#2-heading)
   - [ListBlock](#3-listblock)
   - [Blockquote](#4-blockquote)
   - [Callout](#5-callout)
   - [CodeBlock](#6-codeblock)
   - [HorizontalRule](#7-horizontalrule)
4. [Type Definitions](#type-definitions)
5. [Architectural Rules](#architectural-rules)

---

## Block Architecture Overview

### **Flat Document Model**

Clutter uses a **flat block structure** (Notion/Craft-style):

- All blocks are top-level siblings
- No nested block structures (e.g., no `<ul><li>` nesting)
- Indentation is controlled by `indent` attribute only
- Parent-child relationships are derived from indent levels, not DOM structure

### **Block Primitives Architecture**

All block components use a **unified primitives system** that separates mechanics from meaning:

**Block Mechanics** (handled by primitives):

- Hover detection zones
- Selection halos
- Layout (padding, margin, positioning)
- Focus/blur handling
- Indent calculation

**Block Meaning** (handled by components):

- Domain-specific logic (list numbering, task state, etc.)
- Content rendering
- Specialized behavior

**Benefits:**

- 27% code reduction across all blocks (1,818 → 1,323 lines)
- Single source of truth for common behavior
- Consistent UX across all block types
- One place to fix bugs

**Documentation:** See `packages/editor/components/blocks/BLOCK_COMPONENTS.md`

### **Block Identity**

Every block MUST have:

1. **Unique `blockId`** (UUID) - stable identifier that never changes
2. **`indent`** (0..n) - sole source of structural truth
3. **`collapsed`** (boolean) - visibility state for children
4. **`createdAt`** (ISO timestamp) - creation time
5. **`updatedAt`** (ISO timestamp) - last modification time

### **Content Types**

Blocks come in two content flavors:

- **`content: 'inline*'`** - Can contain text with formatting marks (most blocks)
- **`content: 'text*'`** - Plain text only, no marks (code blocks)

---

## Common Attributes (All Blocks)

All 7 block types share these core attributes:

```typescript
interface CommonBlockAttributes {
  // ━━━ Identity ━━━
  blockId: string | null; // UUID, assigned by BlockIdGenerator

  // ━━━ Structure (FLAT MODEL) ━━━
  indent: number; // 0..n, ONLY structural attribute
  collapsed: boolean; // Hide children in flat tree

  // ━━━ Metadata ━━━
  createdAt: string | null; // ISO 8601 timestamp
  updatedAt: string | null; // ISO 8601 timestamp
}
```

### **Attribute Details**

#### **`blockId`**

- **Type:** `string | null`
- **Default:** `null`
- **Assigned by:** BlockIdGenerator, `performStructuralEnter()`, `parseHTML`
- **Never:** Regenerated during transactions (prevents identity loss)
- **HTML:** `data-block-id="uuid"`

#### **`indent`**

- **Type:** `number`
- **Default:** `0`
- **Range:** `0..n` (unlimited nesting)
- **Purpose:** SOLE source of structural hierarchy
- **HTML:** `data-indent="0"`

#### **`collapsed`**

- **Type:** `boolean`
- **Default:** `false`
- **Purpose:** Visibility control for children
- **Note:** Even leaf nodes (HR) have this for flat visibility algorithm
- **HTML:** `data-collapsed="true"` (only if true)

#### **`createdAt`**

- **Type:** `string | null`
- **Default:** `null`
- **Format:** ISO 8601 (e.g., `"2026-01-26T10:30:00.000Z"`)
- **Preserved:** During block conversions
- **HTML:** `data-created-at="ISO_STRING"`

#### **`updatedAt`**

- **Type:** `string | null`
- **Default:** `null`
- **Format:** ISO 8601
- **Updated:** By BlockTimestampTracker extension
- **HTML:** `data-updated-at="ISO_STRING"`

---

## Block Types

### **1. Paragraph**

**The default block for text content.**

#### Type Signature

```typescript
Node: {
  name: 'paragraph';
  group: 'block';
  content: 'inline*';
  defining: false;
}
```

#### Specific Attributes

```typescript
interface ParagraphAttributes extends CommonBlockAttributes {
  tags: string[]; // Tag IDs for this paragraph (Notion-style tags)
}
```

#### Attributes Table

| Attribute | Type       | Default | Description                                 |
| --------- | ---------- | ------- | ------------------------------------------- |
| `tags`    | `string[]` | `[]`    | Array of tag IDs attached to this paragraph |

#### HTML Representation

```html
<p
  data-block-id="uuid"
  data-indent="0"
  data-collapsed="false"
  data-tags='["tag1","tag2"]'
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
>
  Text content with <strong>marks</strong>
</p>
```

#### Commands

- `setParagraph()` - Convert current block to paragraph
- **Keyboard:** `Mod-Alt-0`

#### Special Behavior

- Default block type when converting from non-paragraph
- Supports all inline marks (bold, italic, etc.)
- Can have tags attached via `data-tags` attribute

---

### **2. Heading**

**H1, H2, H3 headings with configurable levels.**

#### Type Signature

```typescript
Node: {
  name: 'heading';
  group: 'block';
  content: 'inline*';
  defining: true;
}
```

#### Specific Attributes

```typescript
interface HeadingAttributes extends CommonBlockAttributes {
  headingLevel: 1 | 2 | 3; // H1, H2, or H3
}
```

#### Attributes Table

| Attribute      | Type          | Default | Description                               |
| -------------- | ------------- | ------- | ----------------------------------------- |
| `headingLevel` | `1 \| 2 \| 3` | `1`     | Heading level (H1=32px, H2=24px, H3=20px) |

#### HTML Representation

```html
<h2
  data-block-id="uuid"
  data-indent="0"
  data-collapsed="false"
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
>
  Heading text
</h2>
```

#### Commands

- `setHeading({ headingLevel: 1 | 2 | 3 })` - Set heading level
- `toggleHeading({ headingLevel: 1 | 2 | 3 })` - Toggle heading
- **Keyboard:**
  - `Mod-Alt-1` → H1
  - `Mod-Alt-2` → H2
  - `Mod-Alt-3` → H3

#### Visual Styles

- **H1:** 32px, bold
- **H2:** 24px, semibold
- **H3:** 20px, semibold

#### Special Behavior

- Markdown conversion NOT supported (unlike TipTap default)
- `defining: true` - defines its own boundaries for backspace

---

### **3. ListBlock**

**Unified list item (bullet, numbered, task, toggle).**

Notion-style flat list where each item is independent.

#### Type Signature

```typescript
Node: {
  name: 'listBlock';
  group: 'block';
  content: 'inline*';
  defining: true;
}
```

#### Specific Attributes

```typescript
type ListType = 'bullet' | 'numbered' | 'task' | 'toggle';

interface ListBlockAttributes extends CommonBlockAttributes {
  listType: ListType; // Visual marker style
  checked: boolean | null; // Task completion state
  priority: number; // 0-3 (!, !!, !!!)
}
```

#### Attributes Table

| Attribute  | Type                                           | Default    | Description                             |
| ---------- | ---------------------------------------------- | ---------- | --------------------------------------- |
| `listType` | `'bullet' \| 'numbered' \| 'task' \| 'toggle'` | `'bullet'` | Determines marker/icon                  |
| `checked`  | `boolean \| null`                              | `null`     | Task completion (null = not a task)     |
| `priority` | `number`                                       | `0`        | Priority level (0=none, 1-3=!, !!, !!!) |

#### HTML Representation

```html
<div
  data-type="listBlock"
  data-block-id="uuid"
  data-list-type="task"
  data-indent="1"
  data-collapsed="false"
  data-checked="false"
  data-priority="2"
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
>
  Task item text
</div>
```

#### Commands

- `setListBlock(listType, checked?)` - Set list type
- `toggleListBlock(listType)` - Toggle list type

#### List Type Behaviors

| Type       | Marker   | Features                       |
| ---------- | -------- | ------------------------------ |
| `bullet`   | •        | Simple bullet point            |
| `numbered` | 1. 2. 3. | Sequential numbering           |
| `task`     | ☐/☑      | Checkable, has `checked` state |
| `toggle`   | ▶/▼      | Collapsible, uses `collapsed`  |

#### Special Behavior

- **Task lists:**
  - `checked: false` → unchecked ☐
  - `checked: true` → checked ☑
  - `checked: null` → not a task
- **Priority levels:**
  - `0` = no priority
  - `1` = ! (low)
  - `2` = !! (medium)
  - `3` = !!! (high)
- **Toggle lists:** Use `collapsed` attribute to hide children

---

### **4. Blockquote**

**Quoted text block with left border.**

#### Type Signature

```typescript
Node: {
  name: 'blockquote';
  group: 'block';
  content: 'inline*';
  defining: true;
}
```

#### Specific Attributes

```typescript
// Only common attributes (no specific attrs)
interface BlockquoteAttributes extends CommonBlockAttributes {}
```

#### HTML Representation

```html
<blockquote
  data-block-id="uuid"
  data-indent="0"
  data-collapsed="false"
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
>
  Quoted text
</blockquote>
```

#### Commands

- `setBlockquote()` - Convert to blockquote
- `toggleBlockquote()` - Toggle blockquote
- `unsetBlockquote()` - Remove blockquote
- **Keyboard:** `Mod-Shift-b`

#### Visual Styles

- 3px left border
- 2px vertical margin
- Slightly indented content

---

### **5. Callout**

**Colored callout blocks (info, warning, error, success).**

#### Type Signature

```typescript
Node: {
  name: 'callout';
  group: 'block';
  content: 'inline*';
  defining: true;
}
```

#### Specific Attributes

```typescript
type CalloutType = 'info' | 'warning' | 'error' | 'success';

interface CalloutAttributes extends CommonBlockAttributes {
  type: CalloutType; // Determines color/icon
}
```

#### Attributes Table

| Attribute | Type                                          | Default  | Description     |
| --------- | --------------------------------------------- | -------- | --------------- |
| `type`    | `'info' \| 'warning' \| 'error' \| 'success'` | `'info'` | Callout variant |

#### HTML Representation

```html
<div
  data-type="callout"
  data-callout-type="warning"
  data-block-id="uuid"
  data-indent="0"
  data-collapsed="false"
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
>
  Warning message
</div>
```

#### Commands

- `setCallout({ type })` - Set callout type
- `toggleCallout({ type })` - Toggle callout

#### Callout Types

| Type      | Color  | Icon | Purpose                |
| --------- | ------ | ---- | ---------------------- |
| `info`    | Blue   | ℹ️   | Informational messages |
| `warning` | Yellow | ⚠️   | Warnings               |
| `error`   | Red    | ❌   | Errors                 |
| `success` | Green  | ✓    | Success messages       |

---

### **6. CodeBlock**

**Multi-line code block with syntax highlighting.**

#### Type Signature

```typescript
Node: {
  name: 'codeBlock';
  group: 'block';
  content: 'text*'; // ⚠️ Plain text only, NO marks
  marks: ''; // ⚠️ Marks not allowed
  code: true;
  defining: true;
}
```

#### Specific Attributes

```typescript
interface CodeBlockAttributes extends CommonBlockAttributes {
  language: string | null; // Syntax highlighting language
}
```

#### Attributes Table

| Attribute  | Type             | Default | Description                                                     |
| ---------- | ---------------- | ------- | --------------------------------------------------------------- |
| `language` | `string \| null` | `null`  | Language for syntax highlighting (e.g., 'typescript', 'python') |

#### HTML Representation

```html
<pre
  data-block-id="uuid"
  data-language="typescript"
  data-indent="0"
  data-collapsed="false"
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
>
  <code>const x = 42;</code>
</pre>
```

#### Commands

- `setCodeBlock({ language? })` - Set code block
- `toggleCodeBlock({ language? })` - Toggle code block
- **Keyboard:** `Mod-Alt-c`

#### Special Behavior

- **Tab key:** Inserts literal `\t` character (not indent)
- **Shift+Enter:** Same as Enter (newline)
- **No marks:** Text is plain, no bold/italic/etc.
- **Whitespace:** Preserved (`preserveWhitespace: 'full'`)

#### Supported Languages

Language detection depends on syntax highlighter (e.g., Prism, Highlight.js):

- `typescript`, `javascript`, `python`, `rust`, `go`, `java`, etc.

---

### **7. HorizontalRule**

**Divider line (void node).**

#### Type Signature

```typescript
Node: {
  name: 'horizontalRule';
  group: 'block';
  atom: true; // ⚠️ Void node (no content)
  selectable: true;
  draggable: true;
}
```

#### Specific Attributes

```typescript
interface HorizontalRuleAttributes extends CommonBlockAttributes {
  style: 'plain' | 'wavy'; // Visual style
  fullWidth: boolean; // Span full width
  color: string; // Color variant
}
```

#### Attributes Table

| Attribute   | Type                | Default     | Description            |
| ----------- | ------------------- | ----------- | ---------------------- |
| `style`     | `'plain' \| 'wavy'` | `'plain'`   | Line style             |
| `fullWidth` | `boolean`           | `true`      | Full width or centered |
| `color`     | `string`            | `'default'` | Color variant          |

#### HTML Representation

```html
<hr
  data-block-id="uuid"
  data-style="plain"
  data-indent="0"
  data-collapsed="false"
  data-full-width="true"
  data-color="default"
  data-created-at="2026-01-26T10:30:00.000Z"
  data-updated-at="2026-01-26T10:35:00.000Z"
/>
```

#### Commands

- `setHorizontalRule()` - Insert plain divider
- `setBreakLine()` - Insert wavy divider

#### Special Behavior

- **Void node:** No content, self-closing
- **Selectable:** Can be selected by clicking
- **Draggable:** Can be moved via drag & drop
- **Deletion:** Delete/Backspace removes when selected
- **Markdown:** `---` → plain, `***` → wavy (not implemented)

---

## Type Definitions

### **Core Types**

```typescript
// List types
type ListType = 'bullet' | 'numbered' | 'task' | 'toggle';

// Heading levels
type HeadingLevel = 1 | 2 | 3;

// Callout types
type CalloutType = 'info' | 'warning' | 'error' | 'success';

// Block types (for conversion)
type BlockType =
  | 'paragraph'
  | 'heading'
  | 'listBlock'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'toggleBlock';
```

### **ListBlock Interface**

```typescript
interface ListBlockAttrs {
  blockId: string;
  listType: ListType;
  indent: number;
  checked: boolean | null;
  collapsed: boolean;
  priority: number;
  createdAt: string | null;
  updatedAt: string | null;
}
```

---

## Architectural Rules

### **1. Block Identity Law**

`blockId` is **ONLY** assigned by:

1. `BlockIdGenerator.onCreate()` (fills gaps on mount)
2. `performStructuralEnter()` (explicit creation)
3. `parseHTML()` (loading saved content)

**NEVER:**

- By ProseMirror schema defaults (prevents regeneration)
- During transactions (causes identity loss)
- Manually in code (use `createBlockNode()`)

### **2. Flat Model Rules**

- **Structure = `indent` only**
  - No parent pointers
  - No derived levels
  - Parent-child inferred from indent values

- **One structural attribute:**
  - `indent` is the SOLE source of truth
  - Range: `0..n` (unlimited nesting)

- **Visibility via `collapsed`:**
  - When parent is `collapsed: true`, hide children
  - Children determined by indent algorithm

### **3. Content Model**

Two content types:

- **`inline*`** (most blocks) - Can contain marks
- **`text*`** (code blocks) - Plain text only

### **4. Timestamp Management**

- **`createdAt`:** Set once on creation, never changed
- **`updatedAt`:** Updated on content/attribute changes
- **Preserved:** During block conversions
- **Tracked by:** `BlockTimestampTracker` extension

### **5. Keyboard Handling**

All keyboard behavior is centralized:

- **Enter/Backspace/Delete:** Handled by `KeyboardEngine`
- **Tab/Shift+Tab:** Emit `indent-block`/`outdent-block` intents
- **Node extensions:** Return `false` (delegate to engine)

**Exception:** CodeBlock Tab (inserts literal `\t`)

**Collapsed Containers:**

- Enter in collapsed container → creates sibling after subtree (not invisible child)
- Tab under collapsed container → auto-expands parent (prevents invisible children)

**Documentation:** See `packages/editor/plugins/keyboard/COLLAPSED_CONTAINERS.md`

### **6. Block Conversion**

Use `convertBlock()` utility:

```typescript
convertBlock(editor, blockId, {
  type: 'heading',
  headingLevel: 2,
});
```

**Preserves:**

- `blockId` (identity)
- `createdAt` (history)
- `indent` (structure)
- `collapsed` (visibility)

---

## Summary Statistics

### **Block Count: 7 Total**

| Block          | Content   | Defining | Specific Attrs                    | Commands |
| -------------- | --------- | -------- | --------------------------------- | -------- |
| Paragraph      | `inline*` | ❌       | `tags`                            | 1        |
| Heading        | `inline*` | ✅       | `headingLevel`                    | 2        |
| ListBlock      | `inline*` | ✅       | `listType`, `checked`, `priority` | 2        |
| Blockquote     | `inline*` | ✅       | none                              | 3        |
| Callout        | `inline*` | ✅       | `type`                            | 2        |
| CodeBlock      | `text*`   | ✅       | `language`                        | 2        |
| HorizontalRule | void      | ❌       | `style`, `fullWidth`, `color`     | 2        |

### **Common Attributes: 5**

1. `blockId` (string)
2. `indent` (number)
3. `collapsed` (boolean)
4. `createdAt` (string)
5. `updatedAt` (string)

### **Total Attribute Count: 26**

- Common: 5 × 7 blocks = 35 slots
- Specific: 9 unique specific attributes
- Total: 44 attribute slots across all blocks

---

## Design Considerations for Redesign

### **Keep:**

✅ Flat document model (proven architecture)  
✅ Common attribute base (consistency)  
✅ Block identity system (stability)  
✅ Timestamp tracking (history)  
✅ Indent-based structure (flexibility)

### **Consider:**

🤔 Consolidate ListBlock variants (too many types?)  
🤔 Add more callout types (note, tip, etc.)  
🤔 Extensible block attributes (custom fields)  
🤔 Block templates (reusable patterns)  
🤔 Block relationships (explicit links between blocks)

### **Future:**

🚀 Media blocks (image, video, embed)  
🚀 Database blocks (table, kanban, gallery)  
🚀 AI blocks (prompt, completion, workflow)  
🚀 Collaborative blocks (comments, suggestions)

---

## Inline Marks

Marks are inline formatting that can be applied to text within blocks (except CodeBlock).

### **Available Marks (9 total)**

| Mark              | Tag                    | Keyboard      | Description            |
| ----------------- | ---------------------- | ------------- | ---------------------- |
| **Bold**          | `<strong>`             | `Mod-b`       | Bold text              |
| **Italic**        | `<em>`                 | `Mod-i`       | Italic text            |
| **Underline**     | `<u>`                  | `Mod-u`       | Underlined text        |
| **Strike**        | `<s>`                  | `Mod-Shift-x` | Strikethrough text     |
| **Code**          | `<code>`               | `Mod-e`       | Inline code            |
| **Highlight**     | `<mark>`               | `Mod-Shift-h` | Highlighted background |
| **WavyUnderline** | `<span class="wavy">`  | -             | Wavy underline         |
| **TextColor**     | `<span style="color">` | -             | Custom text color      |
| **Link**          | `<a>`                  | `Mod-k`       | Hyperlinks             |

### **Mark Behavior**

- **Applied to:** Text selections within `inline*` content
- **Not allowed in:** CodeBlock (`content: 'text*'`)
- **Stackable:** Multiple marks can be applied to same text
- **Commands:** Each mark has `setMark()`, `toggleMark()`, `unsetMark()`

### **Link Mark Attributes**

```typescript
interface LinkAttrs {
  href: string; // URL
  target?: string; // '_blank', '_self', etc.
  rel?: string; // 'noopener', 'noreferrer', etc.
}
```

**HTML:** `<a href="url" target="_blank" rel="noopener">text</a>`

---

## Related Documentation

### Architecture

- `packages/editor/components/blocks/BLOCK_COMPONENTS.md` - Block primitives architecture
- `packages/editor/components/blocks/primitives/README.md` - Primitives API reference
- `BLOCK_CREATION_CONTRACT.md` - Block creation rules
- `.cursor/skills/editor-architecture/SKILL.md` - Architectural enforcement

### Keyboard Behavior

- `packages/editor/plugins/keyboard/ARCHITECTURE.md` - Keyboard handler contract
- `packages/editor/plugins/keyboard/COLLAPSED_CONTAINERS.md` - Collapsed toggle/task behavior

### Other Features

- `FLOATING_UI_ARCHITECTURE.md` - Floating menus and dropdowns
- `packages/editor/EDITOR_CHROME_LAYER.md` - Block chrome (hover controls)
- `packages/editor/BLOCK_TIMESTAMPS.md` - Timestamp tracking

---

**End of Complete Blocks Reference**
