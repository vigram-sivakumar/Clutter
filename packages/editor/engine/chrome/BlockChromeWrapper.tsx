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

  // Quote blocks: Two-column layout with orange marker bar
  if (blockType === 'quote') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px', // spacing.inline
        }}
      >
        {/* Marker container - 24px wide */}
        <div
          style={{
            width: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Orange bar - 4px wide */}
          <div
            className="blockquote-line"
            style={{
              width: '4px',
              alignSelf: 'stretch', // Fill height
              backgroundColor: colors.semantic.orange,
              borderRadius: '2px',
            }}
          />
        </div>

        {/* Content column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.text.secondary, // Secondary text color for quotes
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
