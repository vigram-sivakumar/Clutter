/**
 * NoteLinkView - React NodeView for NoteLink nodes
 * Renders clickable links with proper SVG icons
 */

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { CalendarBlank, Note, Folder } from '@clutter/ui';
import { MentionPill } from './MentionPill';

export function NoteLinkView({ node, editor }: NodeViewProps) {
  const { linkType, targetId, label, emoji } = node.attrs;

  // Determine icon based on link type and whether there's a custom emoji
  const renderIcon = () => {
    if (emoji) {
      return <span>{emoji}</span>;
    }

    // Determine if it's a daily note (linkType is 'note' and label contains date format)
    const isDailyNote = linkType === 'note' && /\w+,\s\w+\s\d+\s\d{4}/.test(label);

    if (isDailyNote) {
      return <CalendarBlank style={{ width: '14px', height: '14px' }} />;
    }

    if (linkType === 'folder') {
      return <Folder style={{ width: '14px', height: '14px' }} />;
    }

    return <Note style={{ width: '14px', height: '14px' }} />;
  };

  // Handle click to navigate
  const handleClick = () => {
    // Get onNavigate callback from the extension's options
    const onNavigate = editor.extensionManager.extensions.find(
      ext => ext.name === 'noteLink'
    )?.options.onNavigate;

    if (onNavigate && linkType && targetId) {
      onNavigate(linkType, targetId);
    }
  };

  return (
    <NodeViewWrapper as="span" className="note-link">
      <MentionPill
        icon={renderIcon()}
        label={label}
        dataType="note-link"
        data-link-type={linkType}
        data-target-id={targetId}
        onClick={handleClick}
      />
    </NodeViewWrapper>
  );
}

