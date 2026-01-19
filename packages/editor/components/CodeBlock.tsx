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
import { BlockHandle } from './BlockHandle';
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

  // Force re-render when document updates (to react to parent toggle collapse)
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleSelection = () => {
      forceUpdate((prev) => prev + 1);
    };

    // ✅ Only re-render on selection / focus changes (NOT on typing)
    // ProseMirror handles text DOM updates directly - React must not interfere
    // Removed 'update' listener to prevent re-rendering entire block tree on every keystroke
    editor.on('selectionUpdate', handleSelection); // Re-render on selection change for placeholder focus detection
    editor.on('focus', handleSelection);
    editor.on('blur', handleSelection);
    return () => {
      editor.off('selectionUpdate', handleSelection);
      editor.off('focus', handleSelection);
      editor.off('blur', handleSelection);
    };
  }, [editor]);

  // Calculate indent based on flat model indent attribute
  const totalIndent = indent * spacing.indent;

  return (
    <NodeViewWrapper
      as="pre"
      data-type="codeBlock"
      data-language={language}
      data-indent={indent}
      data-empty={isEmpty ? 'true' : undefined}
      data-placeholder={placeholderText || undefined}
      data-hidden={isHidden ? 'true' : undefined}
      className="block-handle-wrapper"
      style={{
        // No margin - parent uses gap for spacing
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
