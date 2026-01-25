/**
 * DateMentionView - React NodeView for DateMention nodes
 * Uses InlineToken primitive to ensure baseline alignment
 */

import { useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { At } from '@clutter/ui';
import { InlineToken, TokenPill } from '../../primitives';
import { useEditorTheme } from '../../theme/EditorThemeContext';

export function DateMentionView({ node }: NodeViewProps) {
  const { label } = node.attrs;
  const { colors } = useEditorTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(false);

  // Enable hover effects after a short delay to prevent immediate hover on insertion
  useEffect(() => {
    const timer = setTimeout(() => {
      setHoverEnabled(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const color = (isHovered && hoverEnabled) ? colors.text.hover : colors.text.tertiary;

  return (
    <NodeViewWrapper as="span" className="date-mention">
      <span
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <InlineToken>
          <TokenPill 
            variant="date"
            icon={<At style={{ width: '16px', height: '16px' }} />}
            color={color}
            style={{
              transition: 'color 300ms ease',
              fontSize: '16px',
              lineHeight: '24px',
            }}
          >
            {label}
          </TokenPill>
        </InlineToken>
      </span>
    </NodeViewWrapper>
  );
}

