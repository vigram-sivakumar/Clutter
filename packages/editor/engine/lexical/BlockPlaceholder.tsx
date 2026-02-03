/**
 * Block Placeholder
 *
 * Shared placeholder component for all block types.
 * Automatically aligns to text baseline via CSS inheritance.
 *
 * Architecture:
 * - Each block decides WHEN to show (isEmpty + isFocused)
 * - This component handles HOW to render
 * - Positioning is automatic via layout
 */

import React from 'react';

export interface BlockPlaceholderProps {
  /** Whether to show the placeholder */
  visible: boolean;

  /** Placeholder text */
  text: string;
}

/**
 * Baseline-aligned placeholder that matches caret position exactly.
 *
 * CSS Strategy:
 * - position: absolute with inset: 0
 * - Inherits padding from parent
 * - line-height matches editor (1.5)
 * - Color is muted, pointer-events: none
 */
export function BlockPlaceholder({ visible, text }: BlockPlaceholderProps) {
  if (!visible) return null;

  return (
    <div
      className="block-placeholder"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        padding: '4px 8px', // Must match ContentEditable padding
        lineHeight: '1.5', // Must match ContentEditable line-height
        color: '#999',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </div>
  );
}
