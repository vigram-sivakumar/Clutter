/**
 * Placeholder Component
 * 
 * Renders a placeholder text overlay for empty blocks.
 * Positioned absolutely over the content area.
 * 
 * Extracted from duplicated JSX across Paragraph, Heading, ListBlock components.
 */

import React from 'react';
import { placeholders } from '../../tokens';
import { useEditorTheme } from '../../theme/EditorThemeContext';

interface PlaceholderProps {
  /** Custom placeholder text (defaults to "Type '/' for commands") */
  text?: string;
  /** Additional styles to merge (e.g., fontSize for headings) */
  style?: React.CSSProperties;
}

/**
 * Placeholder text overlay for empty focused blocks
 */
export function Placeholder({ text = placeholders.default, style }: PlaceholderProps) {
  const { colors } = useEditorTheme();

  return (
    <span
      contentEditable={false}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        color: colors.text.placeholder,
        pointerEvents: 'none',
        userSelect: 'none',
        ...style,
      }}
    >
      {text}
    </span>
  );
}

