/**
 * NoteLinkView - React NodeView for NoteLink nodes
 * Uses InlineToken primitive to ensure baseline alignment
 */

import { useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { CalendarBlank, Note, Folder } from '@clutter/ui';
import { InlineToken, TokenPill } from '../../primitives';
import { useEditorTheme } from '../../theme/EditorThemeContext';

export function NoteLinkView({ node, editor }: NodeViewProps) {
  const { linkType, targetId, label, emoji } = node.attrs;
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

  // Determine icon based on link type and whether there's a custom emoji
  const renderIcon = () => {
    if (emoji) {
      return <span>{emoji}</span>;
    }

    // Determine if it's a daily note (linkType is 'note' and label contains date format)
    const isDailyNote = linkType === 'note' && /\w+,\s\w+\s\d+\s\d{4}/.test(label);

    if (isDailyNote) {
      return <CalendarBlank style={{ width: '16px', height: '16px' }} />;
    }

    if (linkType === 'folder') {
      return <Folder style={{ width: '16px', height: '16px' }} />;
    }

    return <Note style={{ width: '16px', height: '16px' }} />;
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

  const color = (isHovered && hoverEnabled) ? colors.text.hover : colors.text.tertiary;

  return (
    <NodeViewWrapper as="span" className="note-link">
      <span
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <InlineToken>
          <TokenPill 
            variant="page"
            icon={renderIcon()}
            color={color}
            onClick={handleClick}
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

