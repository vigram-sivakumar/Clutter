/**
 * DateMentionInline - React NodeView for DateMention nodes
 * Uses InlineToken primitive to ensure baseline alignment
 */

import { useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { At } from '@clutter/ui';
import { InlineToken, TokenPill } from '../../primitives';
import { useEditorTheme } from '../../theme/EditorThemeContext';

export function DateMentionInline({ node }: NodeViewProps) {
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

  const backgroundColor = (isHovered && hoverEnabled) ? colors.background.hover : 'transparent';

  return (
    <NodeViewWrapper as="span" className="date-mention">
      <span
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <InlineToken>
          <TokenPill 
            variant="date"
            icon={<At style={{ width: '1em', height: '1em' }} />}
            color={colors.text.tertiary}
            backgroundColor={backgroundColor}
            style={{
              transition: 'background-color 300ms ease',
            }}
          >
            {label}
          </TokenPill>
        </InlineToken>
      </span>
    </NodeViewWrapper>
  );
}
