/**
 * Blockquote - React node view for blockquotes with block primitives
 *
 * Refactored to use block primitives for consistency.
 * Uses uniform block structure with marker area (border line).
 * Includes connector logic for adjacent blockquotes.
 */

import { useMemo } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { spacing, sizing } from '../../tokens';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import {
  useBlock,
  BlockHoverZones,
  MarkerContainer,
  BlockSelectionHalo,
  BlockContentColumn,
} from './primitives';

export function Blockquote({ node, editor, getPos }: NodeViewProps) {
  const { colors } = useEditorTheme();

  // Check if next sibling is also a blockquote (for connector rendering)
  const hasNextBlockquote = useMemo(() => {
    const pos = getPos();
    if (pos === undefined) return false;

    try {
      const nextPos = pos + node.nodeSize;
      const nextNode = editor.state.doc.nodeAt(nextPos);
      return nextNode?.type.name === 'blockquote';
    } catch {
      return false;
    }
  }, [editor.state.doc, getPos, node.nodeSize]);

  // Use block primitives for all common functionality
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    styleOverrides: {
      display: 'flex', // Blockquote-specific: flex layout
      alignItems: 'stretch',
      gap: spacing.inline,
    },
  });

  return (
    <NodeViewWrapper
      as="div"
      {...wrapperProps}
      className="block-handle-wrapper"
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Marker area - 3px border line in 24px container */}
      <MarkerContainer>
        <div
          className="blockquote-line"
          style={{
            width: 4,
            backgroundColor: colors.semantic.orange,
            borderRadius: 2,
          }}
        />
      </MarkerContainer>

      {/* Content column - vertical stacking for text + description */}
      <BlockContentColumn>
        {/* Note: NodeViewContent renders ALL children including blockDescription */}
        <NodeViewContent
          as="div"
          style={{
            color: colors.text.secondary,
          }}
        />
      </BlockContentColumn>

      {/* Craft-style connector: bridge gap to next blockquote */}
      {hasNextBlockquote && (
        <div
          style={{
            position: 'absolute',
            left: indent + sizing.markerContainer / 2 - 2, // Center of marker area (4px / 2)
            bottom: -spacing.gap - 2, // Extend 2px up to overlap
            width: 4,
            height: spacing.gap + 4, // Extend 2px up and 2px down
            backgroundColor: colors.semantic.orange,
          }}
        />
      )}

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
