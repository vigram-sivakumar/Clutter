/**
 * useBlock - Core hook for all block components
 *
 * Handles:
 * - Common wrapper attributes (data-block-id, data-type, etc.)
 * - Indent calculation (hierarchy + extra + mode)
 * - Selection state
 * - Placeholder detection
 * - Empty state
 * - Common styles
 *
 * Returns everything a block needs to render consistently.
 *
 * CONSTRAINT: Only add parameters that apply to ALL block types.
 * Block-specific logic belongs in the block component, not here.
 *
 * Example:
 * ```tsx
 * const { wrapperProps, isSelected, indent, isEmpty } = useBlock({
 *   node,
 *   editor,
 *   getPos,
 *   extraIndent: toggleIndent,
 *   indentMode: 'margin', // for callout, blockquote
 * });
 * ```
 */

import { useMemo, useState, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { typography, spacing } from '../../../tokens';
import { usePlaceholder } from '../../../hooks/usePlaceholder';
import { useBlockSelection } from '../../../hooks/useBlockSelection';
import { useBlockHidden } from '../../../hooks/useBlockHidden';

export interface UseBlockOptions {
  /** ProseMirror node */
  node: any;
  /** TipTap editor instance */
  editor: Editor;
  /** Function to get block position in document */
  getPos: () => number | undefined;
  /** Additional indent beyond node.attrs.indent (e.g., toggle parent indent) */
  extraIndent?: number;
  /**
   * Indent mode:
   * - 'padding': Content indent (default) - used by paragraph, heading, list
   * - 'margin': Box indent - used by callout, blockquote, codeBlock
   */
  indentMode?: 'padding' | 'margin';
  /** Override default styles */
  styleOverrides?: React.CSSProperties;
}

export interface UseBlockReturn {
  /** Props to spread onto NodeViewWrapper */
  wrapperProps: {
    'data-block-id': string;
    'data-type': string;
    'data-indent': number;
    'data-empty'?: 'true';
    'data-placeholder'?: string;
    'data-hidden'?: 'true';
    style: React.CSSProperties;
  };
  /** Whether this block is selected */
  isSelected: boolean;
  /** Placeholder text (null if not applicable) */
  placeholderText: string | null;
  /** Total calculated indent in pixels */
  indent: number;
  /** Whether block content is empty */
  isEmpty: boolean;
}

export function useBlock({
  node,
  editor,
  getPos,
  extraIndent = 0,
  indentMode = 'padding',
  styleOverrides = {},
}: UseBlockOptions): UseBlockReturn {
  // ─────────────────────────────────────────────────────────────────────────
  // Validate blockId exists
  // ─────────────────────────────────────────────────────────────────────────

  const blockId = node.attrs.blockId;
  if (!blockId) {
    throw new Error(
      `Invariant violation: Block rendered without blockId (type: ${node.type.name})`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calculate indent
  // ─────────────────────────────────────────────────────────────────────────

  const baseIndent = node.attrs.indent ?? 0;
  const totalIndent = baseIndent * spacing.indent + extraIndent;

  // ─────────────────────────────────────────────────────────────────────────
  // Check state
  // ─────────────────────────────────────────────────────────────────────────

  // Canonical emptiness check (ProseMirror source of truth)
  const isEmpty = node.content.size === 0;

  // Get placeholder text (with focus detection)
  const placeholderText = usePlaceholder({ node, editor, getPos });

  // Check selection state
  const isSelected = useBlockSelection({
    editor,
    getPos,
    nodeSize: node.nodeSize,
  });

  // Check if hidden by collapsed ancestor
  const isHidden = useBlockHidden(editor, getPos);

  // ─────────────────────────────────────────────────────────────────────────
  // Force re-render on focus/blur (for placeholder visibility)
  // ─────────────────────────────────────────────────────────────────────────

  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleFocusChange = () => {
      forceUpdate((prev) => prev + 1);
    };

    // 🔒 CRITICAL: Do NOT listen to selectionUpdate
    // React re-renders on selection change interfere with ProseMirror's cursor placement
    // Only re-render on focus/blur - selection handled by useMemo in usePlaceholder
    editor.on('focus', handleFocusChange);
    editor.on('blur', handleFocusChange);

    return () => {
      editor.off('focus', handleFocusChange);
      editor.off('blur', handleFocusChange);
    };
  }, [editor]);

  // ─────────────────────────────────────────────────────────────────────────
  // Build wrapper props
  // ─────────────────────────────────────────────────────────────────────────

  const wrapperProps = useMemo(() => {
    // Determine indent property based on mode
    const indentProperty =
      indentMode === 'padding' ? 'paddingLeft' : 'marginLeft';

    return {
      'data-block-id': blockId,
      'data-type': node.type.name,
      'data-indent': baseIndent,
      ...(isEmpty && { 'data-empty': 'true' as const }),
      ...(placeholderText && { 'data-placeholder': placeholderText }),
      ...(isHidden && { 'data-hidden': 'true' as const }),
      style: {
        position: 'relative' as const,
        fontFamily: typography.fontFamily,
        fontSize: typography.body,
        lineHeight: typography.lineHeightRatio,
        [indentProperty]: totalIndent,
        width: '100%',
        // CSS variable for placeholder text (inherited by ::before pseudo-element)
        ...(placeholderText &&
          ({ '--placeholder-text': `"${placeholderText}"` } as any)),
        ...styleOverrides,
      },
    };
  }, [
    blockId,
    node.type.name,
    baseIndent,
    isEmpty,
    placeholderText,
    isHidden,
    totalIndent,
    indentMode,
    styleOverrides,
  ]);

  return {
    wrapperProps,
    isSelected,
    placeholderText,
    indent: totalIndent,
    isEmpty,
  };
}
