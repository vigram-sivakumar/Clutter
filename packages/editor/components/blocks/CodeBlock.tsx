/**
 * CodeBlock - React node view for code blocks with block primitives
 *
 * Refactored to use block primitives for consistency.
 * Full-width block with custom styling and code icon.
 */

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { spacing } from '../../tokens';
import { Code as CodeIcon } from '@clutter/ui';
import { useBlock, BlockHoverZones, BlockSelectionHalo } from './primitives';

export function CodeBlock({
  node,
  editor,
  getPos,
  updateAttributes: _updateAttributes,
}: NodeViewProps) {
  const { colors } = useEditorTheme();
  const { language } = node.attrs;

  // Use block primitives with extra padding for code block base padding
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    extraIndent: 16, // Code blocks have 16px base padding before indent
    styleOverrides: {
      display: 'flex', // CodeBlock-specific: flex layout
      padding: 16,
      backgroundColor: colors.background.secondary,
      border: `1px solid ${colors.border.default}`,
      borderRadius: 4,
      overflow: 'auto',
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginLeft: 0, // Fixed: was incorrectly using raw indent value
    },
  });

  return (
    <NodeViewWrapper
      as="pre"
      {...wrapperProps}
      data-language={language}
      className="block-handle-wrapper"
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Code icon */}
      <div
        contentEditable={false}
        style={{
          position: 'relative',
          padding: spacing['4'],
          borderRadius: 3,
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

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
