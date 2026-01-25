/**
 * HashtagView - React NodeView for HashtagMention nodes
 * Uses InlineToken primitive to ensure baseline alignment
 */

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { InlineToken, TokenPill } from '../../primitives';
import { useTheme, getTagColor } from '@clutter/ui';
import { useTagsStore } from '@clutter/state';

export function HashtagView({ node }: NodeViewProps) {
  const { tag } = node.attrs;
  const { colors } = useTheme();
  const tagMetadata = useTagsStore((state) => state.getTagMetadata(tag));
  
  // Get color (custom or hash-based)
  const colorName = tagMetadata?.color || getTagColor(tag);
  const accentColor = colors.accent[colorName as keyof typeof colors.accent];
  const tagColor = (accentColor && 'bg' in accentColor && 'text' in accentColor ? accentColor : colors.accent.default) as { bg: string; text: string };

  return (
    <NodeViewWrapper as="span" className="hashtag-mention">
      <InlineToken>
        <TokenPill 
          variant="hashtag"
          backgroundColor={tagColor.bg}
          color={tagColor.text}
        >
          {tag}
        </TokenPill>
      </InlineToken>
    </NodeViewWrapper>
  );
}
