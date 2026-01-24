/**
 * CodeBlock - React node view for code blocks
 *
 * PHASE 4 REFACTOR: Uses shared hooks and components.
 * Full-width block with custom styling.
 * No margin - parent handles spacing via gap.
 */

import { useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { placeholders, spacing } from '../tokens';
import { Code as CodeIcon } from '@clutter/ui';
import { usePlaceholder } from '../hooks/usePlaceholder';
import { useBlockSelection } from '../hooks/useBlockSelection';
import { BlockSelectionHalo } from './BlockSelectionHalo';
import { useBlockHidden } from '../hooks/useBlockHidden';

export function CodeBlock({
  node,
  editor,
  getPos,
  updateAttributes: _updateAttributes,
}: NodeViewProps) {
  const { colors } = useEditorTheme();
  const { language, indent = 0 } = node.attrs;

  // Check if this block is selected
  const isSelected = useBlockSelection({
    editor,
    getPos,
    nodeSize: node.nodeSize,
  });

  // Canonical emptiness check (ProseMirror source of truth)
  const isEmpty = node.content.size === 0;

  // Placeholder text (includes focus detection via usePlaceholder)
  const placeholderText = usePlaceholder({
    node,
    editor,
    getPos,
    customText: placeholders.codeBlock,
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

  // Calculate indent based on flat model indent attribute
  const totalIndent = indent * spacing.indent;

  return (
    <NodeViewWrapper
      as="pre"
      data-block-id={node.attrs.blockId}
      data-type="codeBlock"
      data-language={language}
      data-indent={indent}
      data-empty={isEmpty ? 'true' : undefined}
      data-placeholder={placeholderText || undefined}
      data-hidden={isHidden ? 'true' : undefined}
      className="block-handle-wrapper"
      style={{
        display: 'flex',
        padding: 16,
        paddingLeft: 16 + totalIndent, // FLAT MODEL: indent from left
        backgroundColor: colors.background.secondary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: 4,
        overflow: 'auto',
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        position: 'relative',
        marginLeft: indent,
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

      {/* Code icon */}
      <div
        contentEditable={false}
        style={{
          position: 'relative',
          padding: spacing['4'],
          borderRadius: 3,
          // backgroundColor: colors.background.tertiary || colors.background.default,
          color: colors.text.tertiary,
          opacity: 0.4,
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <CodeIcon size={16} />
      </div>
      {/* Code content */}
      <div style={{ flex: 1 }}>
        <NodeViewContent
          as="code"
          style={{
            display: 'block',
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 14,
            lineHeight: 1.5,
            color: colors.text.secondary,
            whiteSpace: 'pre',
          }}
        />
      </div>

      {/* Block selection halo */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
