/**
 * Heading - React node view for headings
 *
 * PHASE 3 REFACTOR: Uses shared hooks and components.
 * No marker area - just content with heading-specific typography.
 * Includes inline placeholder support for empty headings.
 */

import React, { useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { typography, spacing } from '../tokens';
import { usePlaceholder } from '../hooks/usePlaceholder';
import { useBlockSelection } from '../hooks/useBlockSelection';
import { BlockHandle } from './BlockHandle';
import { BlockSelectionHalo } from './BlockSelectionHalo';
import { useBlockHidden } from '../hooks/useBlockHidden';

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

  // 🔥 FLAT MODEL: indent is the ONLY structural attribute
  const blockIndent = node.attrs.indent ?? 0;

  // Canonical emptiness check (ProseMirror source of truth)
  const isEmpty = node.content.size === 0;

  // Placeholder text (includes focus detection via usePlaceholder)
  const placeholderText = usePlaceholder({ node, editor, getPos });

  // Check if this block is selected
  const isSelected = useBlockSelection({
    editor,
    getPos,
    nodeSize: node.nodeSize,
  });

  // 🔥 COLLAPSE PROPAGATION: Check if we're hidden by a collapsed ancestor
  const isHidden = useBlockHidden(editor, getPos);

  // Force re-render when editor focus changes (for placeholder visibility)
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleFocusChange = () => {
      forceUpdate((prev) => prev + 1);
    };

    // 🔒 CRITICAL FIX: Do NOT listen to selectionUpdate
    // React re-renders on selection change interfere with ProseMirror's cursor placement
    // Only re-render on focus/blur - selection handled by useMemo in usePlaceholder
    editor.on('focus', handleFocusChange);
    editor.on('blur', handleFocusChange);
    return () => {
      editor.off('focus', handleFocusChange);
      editor.off('blur', handleFocusChange);
    };
  }, [editor]);

  // Calculate indent (flat model)
  const indent = blockIndent * spacing.indent;

  return (
    <NodeViewWrapper
      as="div"
      data-type="heading"
      data-heading-level={headingLevel}
      data-indent={blockIndent}
      data-hidden={isHidden ? 'true' : undefined}
      data-empty={isEmpty ? 'true' : undefined}
      data-placeholder={placeholderText || undefined}
      className="block-handle-wrapper"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        fontFamily: typography.fontFamily,
        position: 'relative',
        marginTop: styles.marginTop,
        paddingLeft: indent,
      }}
    >
      {/* Invisible hover bridge - covers gap between handle and content */}
      <div
        contentEditable={false}
        style={{
          position: 'absolute',
          left: indent - 32,
          top: 0,
          width: 32,
          height: '100%',
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
      />

      {/* Block handle (⋮⋮) - shows on hover */}
      <BlockHandle editor={editor} getPos={getPos} indent={indent} />

      <NodeViewContent
        as={`h${headingLevel}` as any}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          lineHeight: styles.lineHeight,
          margin: 0,
        }}
      />

      {/* Block selection halo */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />

      {/* CSS to show handle on hover or when menu is open (but not while typing or in multi-selection) */}
      <style>{`
        .block-handle-wrapper:hover .block-handle:not([data-is-typing="true"]):not([data-in-multi-selection="true"]),
        .block-handle[data-menu-open="true"] {
          opacity: 1 !important;
        }
      `}</style>
    </NodeViewWrapper>
  );
}
