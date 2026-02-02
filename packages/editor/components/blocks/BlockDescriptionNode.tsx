/**
 * BlockDescriptionNode - NodeView for blockDescription nodes
 *
 * Real ProseMirror node (not chrome overlay) for block-attached descriptions.
 *
 * Architecture:
 * - This is a REAL document node that participates in flow layout
 * - NOT an overlay, NOT contentEditable={false} chrome
 * - Selection-driven editing (PM handles focus, not React state)
 * - Styled as metadata (muted, smaller) but structurally is content
 *
 * Benefits:
 * - Zero overlap (natural flow)
 * - Copy/paste automatic
 * - Undo/redo automatic
 * - No absolute positioning
 * - No ghost spacers
 * - No modal editor state
 *
 * UX:
 * - Click to focus (PM selection)
 * - Type to edit (normal PM editing)
 * - Enter to exit (keyboard shortcut in schema)
 * - Muted styling differentiates from main content
 */

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { useMemo } from 'react';

export function BlockDescriptionNode({ node, editor, getPos }: NodeViewProps) {
  const { colors } = useEditorTheme();

  // Check if this node is currently focused (selection-driven, not React state)
  const isFocused = useMemo(() => {
    if (!editor.isFocused) return false;

    const pos = getPos();
    if (pos === undefined) return false;

    const { $from } = editor.state.selection;
    return $from.pos >= pos && $from.pos <= pos + node.nodeSize;
  }, [editor.isFocused, editor.state.selection, getPos, node.nodeSize]);

  return (
    <NodeViewWrapper
      as="div"
      data-type="block-description"
      data-focused={isFocused ? 'true' : undefined}
      style={{
        position: 'relative',
        fontSize: 12,
        lineHeight: 1.4,
        color: colors.text.tertiary,
        padding: '2px 0',
        cursor: 'text',
        fontFamily: 'inherit',
        // No block chrome (no handles, no hover zones, no halo)
        // This is metadata, not a structural block
      }}
    >
      <NodeViewContent
        as="div"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          outline: isFocused ? `1px solid ${colors.border.focus}` : 'none',
          outlineOffset: '2px',
          borderRadius: '2px',
          minHeight: '1.4em', // Ensure clickable even when empty
        }}
      />
    </NodeViewWrapper>
  );
}
