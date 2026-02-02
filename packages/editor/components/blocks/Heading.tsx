/**
 * Heading - React node view for headings with block primitives
 *
 * Refactored to use block primitives for consistency.
 * Semantic HTML (h1/h2/h3) with heading-specific typography.
 */

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { typography } from '../../tokens';
import {
  useBlock,
  BlockHoverZones,
  BlockSelectionHalo,
  BlockContentColumn,
} from './primitives';

const headingStyles = {
  1: {
    fontSize: typography.h1,
    fontWeight: typography.weight.bold,
    lineHeight: 1.2,
    marginTop: '24px',
  },
  2: {
    fontSize: typography.h2,
    fontWeight: typography.weight.semibold,
    lineHeight: 1.3,
    marginTop: '20px',
  },
  3: {
    fontSize: typography.h3,
    fontWeight: typography.weight.semibold,
    lineHeight: 1.4,
    marginTop: '16px',
  },
} as const;

export function Heading({ node, editor, getPos }: NodeViewProps) {
  const headingLevel = (node.attrs.headingLevel || 1) as 1 | 2 | 3;
  const styles = headingStyles[headingLevel];

  // Use block primitives for all common functionality
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    styleOverrides: {
      display: 'flex', // Heading-specific: flex layout
      alignItems: 'flex-start',
      marginTop: styles.marginTop, // Heading-specific: vertical spacing
    },
  });

  return (
    <NodeViewWrapper
      as="div"
      {...wrapperProps}
      data-heading-level={headingLevel}
      className="block-handle-wrapper"
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Content column - enforces vertical stacking for content + metadata */}
      <BlockContentColumn>
        {/* Semantic heading with typography */}
        {/* Note: NodeViewContent now renders ALL children including blockDescription */}
        <NodeViewContent
          as={`h${headingLevel}` as any}
          style={{
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            lineHeight: styles.lineHeight,
            margin: 0,
          }}
        />
      </BlockContentColumn>

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
