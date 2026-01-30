# Block Primitives

**Status: Production Ready** ✅

This folder contains shared primitives for all block components, providing consistent behavior and reduced boilerplate across all editor blocks.

## Core Contract

`useBlock` provides universal block behavior. **Only add parameters that apply to ALL block types.**

## Files

- `useBlock.ts` - Core hook for block behavior
- `BlockHoverZones.tsx` - Hover detection zones
- `BlockContent.tsx` - Content wrapper
- `BlockSelectionHalo.tsx` - Selection visual
- `MarkerContainer.tsx` - Marker/icon container
- `blockStyles.ts` - Shared style utilities
- `index.ts` - Public API exports

## Usage Pattern

```tsx
import { useBlock, BlockHoverZones, BlockSelectionHalo } from './primitives';

export function MyBlock({ node, editor, getPos }) {
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
  });

  return (
    <NodeViewWrapper {...wrapperProps}>
      <BlockHoverZones />
      <NodeViewContent />
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
```

## Adding New Parameters to useBlock

**Before adding a parameter, ask:**

1. Does this apply to ALL block types?
2. Or only specific blocks?

If only specific blocks → put it in the block component, NOT in useBlock.

## Architecture Benefits

**Before Primitives:**

- 1,814 lines of block code with extensive duplication
- Hover zones duplicated in every block (154 lines total)
- Selection logic duplicated 7 times (70 lines)
- Placeholder logic duplicated 7 times (70 lines)
- Inconsistent indent handling

**After Primitives:**

- 1,323 lines of block code (27% reduction)
- Single source of truth for all mechanics
- Consistent behavior across all blocks
- One place to change common logic
- Explicit contracts (`indentMode`, `indent` return value)

**Blocks Refactored:**

- ParagraphBlock (49% reduction)
- Heading (44% reduction)
- Callout (31% reduction)
- Blockquote (41% reduction)
- CodeBlock (40% reduction)
- HorizontalRule (15% reduction)
- ListBlock (16% reduction)
