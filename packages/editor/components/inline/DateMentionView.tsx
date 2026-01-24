/**
 * DateMentionView - React NodeView for DateMention nodes
 * Renders date mentions with @ icon from library
 */

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { At } from '@clutter/ui';
import { MentionPill } from './MentionPill';

export function DateMentionView({ node }: NodeViewProps) {
  const { label } = node.attrs;

  return (
    <NodeViewWrapper as="span" className="date-mention">
      <MentionPill
        icon={<At />}
        label={label}
        dataType="date-mention"
      />
    </NodeViewWrapper>
  );
}

