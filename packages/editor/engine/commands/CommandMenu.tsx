/**
 * Command Menu Component
 *
 * Displays slash commands with search/filtering and keyboard navigation.
 */

import { useEffect, useRef } from 'react';
import type { SlashCommand } from './types';

export interface CommandMenuProps {
  /** Filtered commands to display */
  commands: SlashCommand[];

  /** Currently selected command index */
  selectedIndex: number;

  /** Callback when command is selected */
  onSelect: (command: SlashCommand) => void;

  /** Position of the menu */
  position: { top: number; left: number };

  /** Search query */
  query: string;
}

/**
 * Command menu UI
 */
export function CommandMenu({
  commands,
  selectedIndex,
  onSelect,
  position,
  query,
}: CommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && menuRef.current) {
      const menu = menuRef.current;
      const selected = selectedRef.current;

      const menuRect = menu.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();

      if (selectedRect.bottom > menuRect.bottom) {
        selected.scrollIntoView({ block: 'nearest' });
      } else if (selectedRect.top < menuRect.top) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (commands.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          backgroundColor: 'white',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          padding: '12px',
          zIndex: 1000,
          minWidth: '280px',
          maxWidth: '320px',
        }}
      >
        <div style={{ color: '#999', fontSize: '14px' }}>
          No commands found for "{query}"
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        backgroundColor: 'white',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        padding: '6px',
        zIndex: 1000,
        minWidth: '280px',
        maxWidth: '320px',
        maxHeight: '360px',
        overflowY: 'auto',
      }}
    >
      {commands.map((command, index) => {
        const isSelected = index === selectedIndex;

        return (
          <div
            key={command.id}
            ref={isSelected ? selectedRef : null}
            onClick={() => onSelect(command)}
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              backgroundColor: isSelected ? '#f5f5f5' : 'transparent',
              transition: 'background-color 0.1s',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {/* Icon */}
            <div
              style={{
                fontSize: '20px',
                lineHeight: '24px',
                flexShrink: 0,
                width: '24px',
                textAlign: 'center',
              }}
            >
              {command.icon || '📄'}
            </div>

            {/* Text content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#1a1a1a',
                  marginBottom: command.description ? '2px' : 0,
                }}
              >
                {command.label}
              </div>

              {command.description && (
                <div
                  style={{
                    fontSize: '12px',
                    color: '#666',
                    lineHeight: '1.4',
                  }}
                >
                  {command.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
