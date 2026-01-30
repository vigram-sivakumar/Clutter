# Block Components Architecture

**Status:** ✅ Production Ready  
**Last Updated:** 2026-01-29

This document describes the block component architecture using the primitives system. All block components follow this unified pattern for consistent behavior and reduced boilerplate.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Block Primitives System](#block-primitives-system)
3. [Component Architecture](#component-architecture)
4. [Usage Patterns](#usage-patterns)
5. [Primitive Components](#primitive-components)
6. [The useBlock Hook](#the-useblock-hook)
7. [Block Types](#block-types)
8. [Best Practices](#best-practices)
9. [Migration Metrics](#migration-metrics)

---

## Overview

Block components in the Clutter editor follow a **layered primitives architecture** that separates:

- **Block Mechanics** (handled by primitives) - hover zones, selection, layout, focus
- **Block Meaning** (handled by components) - domain logic, content rendering, specialized behavior

**Core Principle:** Primitives handle "how blocks behave", components handle "what blocks mean".

---

## Block Primitives System

### Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│  Block Component (ParagraphBlock, ListBlock, etc.)    │
│  - Domain-specific logic                              │
│  - Content rendering                                  │
│  - Specialized behavior                               │
└──────────────────┬─────────────────────────────────────┘
                   │ uses
                   ↓
┌────────────────────────────────────────────────────────┐
│  Block Primitives (packages/.../primitives/)          │
│  - useBlock hook (behavior)                           │
│  - BlockHoverZones (detection)                        │
│  - BlockSelectionHalo (visual)                        │
│  - BlockContent (wrapper)                             │
│  - MarkerContainer (icons/markers)                    │
└────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Single Source of Truth** - All block mechanics in one place
2. **Composition** - Components compose primitives, don't reimplement
3. **Contract-Based** - `useBlock` provides consistent interface
4. **Type-Safe** - Full TypeScript support with generics

---

## Component Architecture

### Standard Block Structure

All block components follow this structure:

```typescript
import { NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import {
  useBlock,
  BlockHoverZones,
  BlockSelectionHalo,
  BlockContent,
} from './primitives';

export function MyBlock({ node, editor, getPos }: NodeViewProps) {
  // 1. useBlock hook provides universal behavior
  const { wrapperProps, isSelected, indent, isEmpty, placeholderText } = useBlock({
    node,
    editor,
    getPos,
  });

  // 2. Domain-specific logic (what makes this block unique)
  const mySpecificLogic = computeSomething(node.attrs);

  // 3. Render with primitives
  return (
    <NodeViewWrapper {...wrapperProps}>
      <BlockHoverZones />

      <BlockContent>
        <NodeViewContent />
        {/* Domain-specific UI */}
      </BlockContent>

      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
```

---

## Usage Patterns

### Pattern 1: Simple Block (Paragraph, Heading)

**Characteristics:**

- Minimal domain logic
- Standard padding indent mode
- No markers

```typescript
export function ParagraphBlock({ node, editor, getPos }: NodeViewProps) {
  const { wrapperProps, isSelected, indent, isEmpty, placeholderText } = useBlock({
    node,
    editor,
    getPos,
  });

  // Ephemeral blocks (no blockId yet) render minimal UI
  if (!node.attrs.blockId) {
    return (
      <NodeViewWrapper data-block-id={null}>
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper {...wrapperProps}>
      <BlockHoverZones />
      <BlockContent>
        <NodeViewContent data-placeholder={isEmpty ? placeholderText : undefined} />
      </BlockContent>
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
```

**Reduced from:** 159 lines → 81 lines (49% reduction)

---

### Pattern 2: Block with Marker (List, Blockquote)

**Characteristics:**

- Has marker/icon container (24×24px)
- Domain logic for marker rendering
- Standard padding indent mode

```typescript
export function ListBlock({ node, editor, getPos }: NodeViewProps) {
  const { wrapperProps, isSelected, indent, isEmpty, placeholderText } = useBlock({
    node,
    editor,
    getPos,
  });

  // Domain logic: Calculate list numbering, task state, etc.
  const markerContent = renderMarkerContent(node);

  return (
    <NodeViewWrapper {...wrapperProps}>
      <BlockHoverZones />

      <MarkerContainer>{markerContent}</MarkerContainer>

      <BlockContent>
        <NodeViewContent data-placeholder={isEmpty ? placeholderText : undefined} />
      </BlockContent>

      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
```

**Reduced from:** 708 lines → 594 lines (16% reduction)

---

### Pattern 3: Block with Special Layout (Callout, CodeBlock)

**Characteristics:**

- Custom styling (background, border, etc.)
- Margin-based indent (box indents, not content)
- Special layout requirements

```typescript
export function Callout({ node, editor, getPos }: NodeViewProps) {
  const { wrapperProps, isSelected, indent, isEmpty, placeholderText } = useBlock({
    node,
    editor,
    getPos,
    indentMode: 'margin', // Uses marginLeft instead of paddingLeft
  });

  return (
    <NodeViewWrapper {...wrapperProps}>
      <BlockHoverZones />

      <BlockContent style={customCalloutStyles}>
        {/* Icon */}
        <NodeViewContent data-placeholder={isEmpty ? placeholderText : undefined} />
      </BlockContent>

      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
```

**Reduced from:** 203 lines → 139 lines (31% reduction)

---

### Pattern 4: Void Block (HorizontalRule)

**Characteristics:**

- No content (atom: true)
- Selectable by click
- Custom rendering

```typescript
export function HorizontalRule({ node, editor, getPos }: NodeViewProps) {
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
  });

  // Domain logic: Custom SVG rendering, style variants, etc.
  const hrElement = renderCustomHR(node.attrs);

  return (
    <NodeViewWrapper {...wrapperProps}>
      <BlockHoverZones />
      {hrElement}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
```

**Reduced from:** 274 lines → 232 lines (15% reduction)

---

## Primitive Components

### `useBlock` Hook

**Location:** `primitives/useBlock.ts`

**Purpose:** Provides universal block behavior (validation, layout, selection, focus)

**Returns:**

```typescript
interface UseBlockReturn {
  wrapperProps: {
    'data-block-id': string | null;
    'data-indent': number;
    style: CSSProperties;
  };
  isSelected: boolean;
  placeholderText: string;
  indent: number; // Total indent (base + extra)
  isEmpty: boolean;
}
```

**Parameters:**

```typescript
interface UseBlockOptions {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: () => number | undefined;
  extraIndent?: number; // Additional indent (e.g., 16px for CodeBlock)
  indentMode?: 'padding' | 'margin'; // How to apply indent (default: 'padding')
  styleOverrides?: CSSProperties; // Additional styles
}
```

---

### `BlockHoverZones`

**Location:** `primitives/BlockHoverZones.tsx`

**Purpose:** Invisible divs that extend hover detection into left/right gutters

**Usage:**

```tsx
<BlockHoverZones />
```

**Implementation:**

- Two absolutely-positioned divs (left: 64px wide, right: 36px wide)
- `data-hover-only="true"` attribute
- Extends hover area beyond content for better UX

---

### `BlockContent`

**Location:** `primitives/BlockContent.tsx`

**Purpose:** Wrapper for block content with flex layout

**Usage:**

```tsx
<BlockContent style={customStyles}>
  <NodeViewContent />
</BlockContent>
```

**Styling:**

- `flex: 1` - Takes remaining space
- `minWidth: 0` - Prevents flex overflow
- Allows custom styles via props

---

### `BlockSelectionHalo`

**Location:** `primitives/BlockSelectionHalo.tsx`

**Purpose:** Visual indicator for selected blocks

**Usage:**

```tsx
<BlockSelectionHalo isSelected={isSelected} indent={indent} />
```

**Behavior:**

- Only visible when `isSelected` is true
- Positioned absolutely
- Accounts for indent offset
- GPU-accelerated (transform + will-change)

**Contract:**

- `indent` prop MUST be the total indent value from `useBlock`
- Not extracted from DOM or styles (prevents drift)

---

### `MarkerContainer`

**Location:** `primitives/MarkerContainer.tsx`

**Purpose:** Fixed-size container for list markers, icons, etc.

**Usage:**

```tsx
<MarkerContainer>
  <ListMarker type={listType} />
</MarkerContainer>
```

**Styling:**

- Fixed 24×24px dimensions
- Flex centering
- 8px right margin (from content)

---

## The useBlock Hook

### Contract

`useBlock` provides universal block behavior. **Only add parameters that apply to ALL block types.**

### Parameters

#### `extraIndent?: number`

**Purpose:** Add base padding/margin before indent is applied

**Use cases:**

- CodeBlock: `extraIndent: 16` for base padding
- Most blocks: omit (default 0)

**Example:**

```typescript
const { wrapperProps } = useBlock({
  node,
  editor,
  getPos,
  extraIndent: 16, // CodeBlock has 16px base padding
});
// Result: paddingLeft = 16px + (indent * 24px)
```

---

#### `indentMode?: 'padding' | 'margin'`

**Purpose:** Control whether indent is applied via `paddingLeft` or `marginLeft`

**Use cases:**

- `'padding'` (default): Content indents, chrome stays at edge
  - Used by: Paragraph, Heading, ListBlock, Blockquote
- `'margin'`: Entire box indents, chrome moves with it
  - Used by: Callout, CodeBlock (blocks with backgrounds/borders)

**Example:**

```typescript
// Callout uses margin mode (box indent)
const { wrapperProps } = useBlock({
  node,
  editor,
  getPos,
  indentMode: 'margin',
});
// Result: marginLeft = indent * 24px, paddingLeft = 0
```

---

#### `styleOverrides?: CSSProperties`

**Purpose:** Add custom styles to the wrapper

**Use cases:**

- Callout: background colors, borders
- CodeBlock: monospace font, specific padding

**Example:**

```typescript
const { wrapperProps } = useBlock({
  node,
  editor,
  getPos,
  styleOverrides: {
    backgroundColor: 'var(--color-callout-bg)',
    borderLeft: '3px solid var(--color-callout-border)',
  },
});
```

---

### Return Values

#### `wrapperProps`

**Purpose:** Props to spread on `NodeViewWrapper`

**Contains:**

- `data-block-id`: Block identifier
- `data-indent`: Indent level
- `style`: Computed styles (position, padding/margin, etc.)

**Usage:**

```tsx
<NodeViewWrapper {...wrapperProps}>
```

---

#### `isSelected: boolean`

**Purpose:** Whether this block is currently selected

**Use cases:**

- Pass to `BlockSelectionHalo`
- Conditional rendering of selected-state UI

---

#### `indent: number`

**Purpose:** Total indent value (base indent + extraIndent / 24)

**Contract:** MUST pass this to `BlockSelectionHalo` for correct positioning

**Example:**

```typescript
const { indent } = useBlock({ node, editor, getPos, extraIndent: 16 });
// If node.attrs.indent = 2:
// indent = 2 + Math.ceil(16 / 24) = 2 + 1 = 3
```

---

#### `isEmpty: boolean`

**Purpose:** Whether block content is empty

**Use cases:**

- Show/hide placeholder text
- Conditional styling

---

#### `placeholderText: string`

**Purpose:** Contextual placeholder text

**Behavior:**

- Returns type-specific placeholder (e.g., "Type '/' for commands")
- Only shown when `isEmpty` is true

---

## Block Types

### All 7 Block Types

| Block          | Lines Before | Lines After | Reduction | Pattern        |
| -------------- | ------------ | ----------- | --------- | -------------- |
| ParagraphBlock | 159          | 81          | 49%       | Simple         |
| Heading        | 145          | 81          | 44%       | Simple         |
| Callout        | 203          | 139         | 31%       | Special Layout |
| Blockquote     | 168          | 99          | 41%       | With Marker    |
| CodeBlock      | 161          | 97          | 40%       | Special Layout |
| HorizontalRule | 274          | 232         | 15%       | Void           |
| ListBlock      | 708          | 594         | 16%       | With Marker    |
| **Total**      | **1,818**    | **1,323**   | **27%**   | -              |

---

## Best Practices

### ✅ Do

1. **Always use `useBlock` hook**

   ```typescript
   const { wrapperProps, isSelected, indent } = useBlock({
     node,
     editor,
     getPos,
   });
   ```

2. **Spread `wrapperProps` on NodeViewWrapper**

   ```tsx
   <NodeViewWrapper {...wrapperProps}>
   ```

3. **Pass `indent` to BlockSelectionHalo**

   ```tsx
   <BlockSelectionHalo isSelected={isSelected} indent={indent} />
   ```

4. **Use primitives for common behavior**

   ```tsx
   <BlockHoverZones />
   <BlockContent>...</BlockContent>
   ```

5. **Handle ephemeral blocks**

   ```typescript
   if (!node.attrs.blockId) {
     return <MinimalRenderer />;
   }
   ```

---

### ❌ Don't

1. **Don't reimplement hover zones**

   ```typescript
   // ❌ BAD: Duplicating hover detection
   <div data-hover-only="true" style={{ position: 'absolute', ... }}>
   ```

   ```typescript
   // ✅ GOOD: Use primitive
   <BlockHoverZones />
   ```

2. **Don't extract indent from styles**

   ```typescript
   // ❌ BAD: Fragile, can drift
   const indent = parseInt(wrapperProps.style.paddingLeft) / 24;
   ```

   ```typescript
   // ✅ GOOD: Use returned value
   const { indent } = useBlock({ ... });
   ```

3. **Don't add parameters to `useBlock` for specific blocks**

   ```typescript
   // ❌ BAD: Only applies to one block type
   useBlock({ node, editor, getPos, showTaskIcon: true });
   ```

   ```typescript
   // ✅ GOOD: Handle in component
   const showTaskIcon = node.attrs.listType === 'task';
   ```

4. **Don't bypass primitives for "just this once"**

   ```typescript
   // ❌ BAD: Creates inconsistency
   const isSelected = editor.state.selection.$anchor.parent === node;
   ```

   ```typescript
   // ✅ GOOD: Use primitive
   const { isSelected } = useBlock({ ... });
   ```

---

## Migration Metrics

### Overall Impact

**Before Primitives:**

- 1,818 total lines across 7 blocks
- Hover zones duplicated 7 times (154 lines)
- Selection logic duplicated 7 times (70 lines)
- Placeholder logic duplicated 7 times (70 lines)
- Inconsistent indent handling

**After Primitives:**

- 1,323 total lines (27% reduction)
- Single source of truth for mechanics
- Consistent behavior across all blocks
- One place to fix bugs
- Explicit contracts (`indentMode`, `indent` return)

### Per-Block Improvements

**ParagraphBlock (49% reduction):**

- Before: 159 lines with boilerplate
- After: 81 lines, pure domain logic
- Benefit: Simplest, cleanest implementation

**ListBlock (16% reduction):**

- Before: 708 lines, most complex
- After: 594 lines
- Benefit: Stress test for primitives design, validated robustness

**Callout (31% reduction):**

- Before: 203 lines
- After: 139 lines
- Benefit: Highlighted need for `indentMode` parameter

---

## Related Documentation

- [primitives/README.md](./primitives/README.md) - Primitives reference
- [BLOCKS_COMPLETE_REFERENCE.md](../../../../BLOCKS_COMPLETE_REFERENCE.md) - All block types
- [BLOCK_CREATION_CONTRACT.md](../../../../BLOCK_CREATION_CONTRACT.md) - Block creation rules
- [.cursor/skills/editor-architecture/SKILL.md](../../../../.cursor/skills/editor-architecture/SKILL.md) - Architectural rules

---

**Last Updated:** January 29, 2026 - Initial documentation after primitives refactor
