/**
 * Block Chrome Wrapper
 *
 * Adds visual structure around blocks based on block type:
 * - Quotes: Orange marker bar (4px) in 24px container
 * - Code: Bordered surface with icon
 * - Others: Plain wrapper
 *
 * Matches old TipTap block primitive architecture exactly.
 */

import React from 'react';
import { useBlockStore } from '../store/blockStore';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { Code as CodeIcon } from '@clutter/ui';
import type { BlockType } from '../types/Block';

interface BlockChromeWrapperProps {
  blockId: string;
  children: React.ReactNode;
}

/**
 * Wraps a block editor with appropriate chrome based on block type
 */
export function BlockChromeWrapper({
  blockId,
  children,
}: BlockChromeWrapperProps) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const { colors } = useEditorTheme();

  if (!block) {
    return <>{children}</>;
  }

  const blockType = block.type;

  // Quote blocks: Notion-style structure with border and padding
  if (blockType === 'quote') {
    return (
      <div
        style={{
          marginTop: '4px',
          marginBottom: '4px',
        }}
      >
        <div
          style={{
            borderInlineStart: '3px solid currentcolor', // 3px border like Notion
            paddingInline: '14px', // 14px left/right padding
            width: '100%',
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Code blocks: Bordered surface with icon
  if (blockType === 'code') {
    return (
      <div
        data-styled-surface
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '8px',
          alignItems: 'flex-start',
          padding: '16px',
          backgroundColor: colors.background.secondary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: '4px',
          overflow: 'auto',
        }}
      >
        {/* Code icon */}
        <div
          style={{
            padding: '4px',
            borderRadius: '3px',
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
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Default: Plain wrapper for paragraphs, headings, lists
  return <>{children}</>;
}
