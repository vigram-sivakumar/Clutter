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
      return <CalendarBlank style={{ width: '1em', height: '1em' }} />;
    }

    if (linkType === 'folder') {
      return <Folder style={{ width: '1em', height: '1em' }} />;
    }

    return <Note style={{ width: '1em', height: '1em' }} />;
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

  const backgroundColor = (isHovered && hoverEnabled) ? colors.background.hover : 'transparent';

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
            color={colors.text.tertiary}
            backgroundColor={backgroundColor}
            onClick={handleClick}
            style={{
              transition: 'background-color 300ms ease',
            }}
          >
            {label || 'Untitled'}
          </TokenPill>
        </InlineToken>
      </span>
    </NodeViewWrapper>
  );
}

