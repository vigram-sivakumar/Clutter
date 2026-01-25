/**
 * ParagraphBlock - Top-level paragraph with block handle
 *
 * This component is for TOP-LEVEL paragraphs (standalone blocks).
 * It duplicates the Paragraph logic but adds the block handle (⋮⋮).
 *
 * For NESTED paragraphs (inside lists, toggles, etc.), see Paragraph.tsx
 * which has the same logic without the handle.
 *
 * Note: We can't wrap Paragraph in a div because NodeViewWrapper must be
 * the outermost element for TipTap keyboard events to work properly.
 */

import { useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { typography, spacing } from '../../tokens';
import { usePlaceholder } from '../../hooks/usePlaceholder';
import { useBlockSelection } from '../../hooks/useBlockSelection';
import { BlockSelectionHalo } from '../chrome/BlockSelectionHalo';
import { useBlockHidden } from '../../hooks/useBlockHidden';

export function ParagraphBlock({
  node,
  editor,
  getPos,
}: NodeViewProps) {
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
          fontSize: typography.fontSize,
          lineHeight: typography.lineHeight,
          paddingLeft: spacing.indentUnit * 0 + 'px',
        }}
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  // From here on, blockId is guaranteed to exist (persisted block)
  // 🔥 FLAT MODEL: indent is the ONLY structural attribute
  const blockIndent = node.attrs.indent ?? 0;

  // Canonical emptiness check (ProseMirror source of truth)
  const isEmpty = node.content.size === 0;

  // Placeholder text (includes focus detection via usePlaceholder)
  const placeholderText = usePlaceholder({
    node,
    editor,
    getPos,
  });

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
    // Reason: React re-renders on every selection change interfere with ProseMirror's cursor placement
    // This was causing "cursor stays in old block" bug after Enter key
    //
    // Solution: Only re-render on focus/blur changes
    // Selection changes are handled by useMemo dependencies in usePlaceholder hook
    editor.on('focus', handleFocusChange); // Re-render when editor gains focus
    editor.on('blur', handleFocusChange); // Re-render when editor loses focus
    return () => {
      editor.off('focus', handleFocusChange);
      editor.off('blur', handleFocusChange);
    };
  }, [editor]);

  // Calculate indent based on blockIndent (hierarchy)
  const indent = blockIndent * spacing.indent;

  return (
    <NodeViewWrapper
      as="div"
      data-block-id={blockId}
      data-type="paragraph"
      data-indent={blockIndent}
      data-empty={isEmpty ? 'true' : undefined}
      data-placeholder={placeholderText || undefined}
      data-hidden={isHidden ? 'true' : undefined}
      style={{
        display: 'block',
        fontFamily: typography.fontFamily,
        fontSize: typography.body,
        lineHeight: typography.lineHeightRatio,
        position: 'relative',
        width: '100%',
        paddingLeft: indent,
        marginLeft: 0,
        marginRight: 0,
      }}
    >
      {/* Craft-style hover-only zones */}
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          left: -spacing.hoverZoneLeft,
          width: spacing.hoverZoneLeft,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          right: -spacing.hoverZoneRight,
          width: spacing.hoverZoneRight,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />

      <NodeViewContent
        as="div"
        style={{
          display: 'block',
          width: '100%',
          minWidth: '1ch',
        }}
      />

      {/* Block selection halo */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
