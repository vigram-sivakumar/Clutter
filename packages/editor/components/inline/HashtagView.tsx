/**
 * HashtagView - React NodeView for HashtagMention nodes
 * Uses InlineToken primitive to ensure baseline alignment
 */

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { InlineToken, TokenPill } from '../../primitives';
import { useTheme, getTagColor, HashStraight } from '@clutter/ui';

export function HashtagView({ node }: NodeViewProps) {
  const { tag } = node.attrs;
  const { colors } = useTheme();
  
  // Get color (hash-based)
  // TODO: Support custom tag colors via EditorProvider dependency injection
  const colorName = getTagColor(tag);
  const accentColor = colors.accent[colorName as keyof typeof colors.accent];
  const tagColor = (accentColor && 'bg' in accentColor && 'text' in accentColor ? accentColor : colors.accent.default) as { bg: string; text: string };

  return (
    <NodeViewWrapper as="span" className="hashtag-mention">
      <InlineToken>
        <TokenPill 
          variant="hashtag"
          icon={<HashStraight style={{ width: '1em', height: '1em' }} />}
          backgroundColor={tagColor.bg}
          color={tagColor.text}
        >
          {tag}
        </TokenPill>
      </InlineToken>
    </NodeViewWrapper>
  );
}
