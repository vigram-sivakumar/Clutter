/**
 * HashtagView - React NodeView for HashtagMention nodes
 * Renders hashtag mentions with TagPill styling (same as dropdown)
 */

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { TagPill } from '@clutter/ui';

export function HashtagView({ node }: NodeViewProps) {
  const { tag } = node.attrs;

  return (
    <NodeViewWrapper as="span" className="hashtag-mention">
      <span
        style={{
          display: 'inline-flex',
          verticalAlign: '-2.5px',
          alignItems: 'center',
        }}
      >
        <TagPill label={tag} />
      </span>
    </NodeViewWrapper>
  );
}
