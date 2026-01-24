/**
 * Paragraph - React node view for paragraphs (nested use only)
 *
 * This component is used for paragraphs INSIDE other blocks:
 * - ListBlock content
 * - ToggleBlock content
 * - Blockquote content
 *
 * For TOP-LEVEL paragraphs, see ParagraphBlock.tsx which adds the block handle.
 *
 * Note: We can't wrap this in ParagraphBlock because NodeViewWrapper must be
 * the outermost element. So ParagraphBlock duplicates this logic with the handle.
 *
 * PLACEHOLDER LAW:
 * - Placeholder NEVER creates DOM structure
 * - Rendered via CSS ::before on content element
 * - data-empty and data-placeholder on wrapper
 * - Emptiness determined by node.content.size === 0
 * - Placeholder shows only when block is focused (CSS + usePlaceholder handles this)
 */

import { useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { typography } from '../tokens';
import { usePlaceholder } from '../hooks/usePlaceholder';
import { BlockTagEditor } from './BlockTagEditor';

export function Paragraph({
  node,
  editor,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  const tags = node.attrs.tags || [];
  const hasTags = tags.length > 0;

  // Canonical emptiness check (ProseMirror source of truth)
  const isEmpty = node.content.size === 0;

  // Placeholder text (includes focus detection via usePlaceholder)
  // Returns null if block shouldn't show placeholder (not focused, etc.)
  const placeholderText = usePlaceholder({
    node,
    editor,
    getPos,
    customText: hasTags ? 'Start typing...' : undefined,
  });

  const handleUpdateTags = useCallback(
    (newTags: string[]) => {
      updateAttributes({ tags: newTags });
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper
      as="div"
      data-type="paragraph"
      data-empty={isEmpty ? 'true' : undefined}
      data-placeholder={placeholderText || undefined}
      style={{
        fontFamily: typography.fontFamily,
        fontSize: typography.body,
        lineHeight: '24px',
        position: 'relative',
        // No margin - parent uses gap for spacing
      }}
    >
      <NodeViewContent
        as="div"
        style={{
          display: 'inline',
          minWidth: '1ch',
        }}
      />
      <BlockTagEditor
        tags={tags}
        onUpdate={handleUpdateTags}
        onTagClick={(editor as any).onTagClick}
      />
    </NodeViewWrapper>
  );
}
