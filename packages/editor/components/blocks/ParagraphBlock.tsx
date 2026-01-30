/**
 * ParagraphBlock - Top-level paragraph with block primitives
 *
 * This component is for TOP-LEVEL paragraphs (standalone blocks).
 * For NESTED paragraphs (inside lists, toggles, etc.), see Paragraph.tsx
 *
 * Refactored to use block primitives for consistency and reduced boilerplate.
 */

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { typography } from '../../tokens';
import { useBlock, BlockHoverZones, BlockSelectionHalo } from './primitives';

export function ParagraphBlock({ node, editor, getPos }: NodeViewProps) {
  // 🔒 EPHEMERAL BLOCK TOLERANCE
  // Paragraphs without blockId are ephemeral (mid-transaction state)
  // BlockIdGenerator assigns blockId after user input transactions complete
  // Render must be tolerant - invariants enforced after transaction completion
  const blockId = node.attrs.blockId;
  const isEphemeral = !blockId;

  if (isEphemeral) {
    // Minimal ephemeral render (cursor placeholder or mid-transaction)
    return (
      <NodeViewWrapper
        as="div"
        style={{
          fontSize: typography.body,
          lineHeight: typography.lineHeightRatio,
          paddingLeft: 0,
        }}
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  // Use block primitives for all common functionality
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    styleOverrides: {
      display: 'block', // Paragraph-specific: block layout
      marginLeft: 0,
      marginRight: 0,
    },
  });

  return (
    <NodeViewWrapper as="div" {...wrapperProps}>
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Paragraph content */}
      <NodeViewContent
        as="div"
        style={{
          display: 'block',
          width: '100%',
          minWidth: '1ch',
        }}
      />

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
