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

  // Use block primitives - wrapper is now a plain container
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    styleOverrides: {
      display: 'flex', // Flex column for code surface + description
      flexDirection: 'column',
      marginLeft: 0,
    },
  });

  return (
    <NodeViewWrapper
      as="div"
      {...wrapperProps}
      data-language={language}
      className="block-handle-wrapper"
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Styled code surface - isolated visual box */}
      <pre
        data-styled-surface
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          alignItems: 'flex-start',
          padding: 16,
          paddingLeft: 16 + indent, // Apply indent to inner surface
          backgroundColor: colors.background.secondary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 4,
          overflow: 'auto',
          margin: 0,
        }}
      >
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
        {/* Note: NodeViewContent renders ALL children including blockDescription */}
        <NodeViewContent
          as="code"
          style={{
            flex: 1,
            display: 'block',
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 14,
            lineHeight: 1.5,
            color: colors.text.secondary,
            whiteSpace: 'pre',
          }}
        />
      </pre>

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
