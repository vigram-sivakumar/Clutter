/**
 * Slash Command Menu Component
 * Renders the command menu with theme-aware styling
 */

import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorTheme } from '../theme/EditorThemeContext';
import * as Icons from '@clutter/ui';
import { sizing, spacing } from '@clutter/ui';
import {
  filterSlashCommands,
  type SlashCommand,
  type CommandGroup,
} from '../plugins/SlashCommands';

interface SlashCommandMenuProps {
  editor: Editor | null;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const { colors } = useEditorTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Subscribe to editor storage changes
  useEffect(() => {
    if (!editor) return;

    let cachedPosition: { top: number; left: number } | null = null;
    let cachedStartPos: number | null = null;

    const updateMenu = () => {
      const storage = (editor.storage as any).slashCommands;
      if (!storage) return; // Guard against undefined storage

      const wasOpen = isOpen;
      const isNowOpen = storage.isOpen;
      const currentStartPos = storage.startPos;

      setIsOpen(isNowOpen);
      setQuery(storage.query);
      setSelectedIndex(storage.selectedIndex);

      // PHASE 5: Calculate position when opening OR when startPos changes
      // This handles both initial open and switching between slash commands
      if (isNowOpen) {
        const startPosChanged = cachedStartPos !== currentStartPos;

        if (!wasOpen || startPosChanged) {
          // Menu just opened OR moved to different slash command
          // Calculate position at the START of slash command (where "/" is)
          const coords = editor.view.coordsAtPos(currentStartPos);
          cachedPosition = { top: coords.bottom + 4, left: coords.left };
          cachedStartPos = currentStartPos;
          setPosition(cachedPosition);
        }
        // If already open and same position, keep cached position (prevents jumping while typing)
      } else {
        // Menu closed - clear cache
        cachedPosition = null;
        cachedStartPos = null;
        setPosition(null);
      }
    };

    // Listen to transaction updates
    editor.on('transaction', updateMenu);

    // Initial update to sync state
    updateMenu();

    return () => {
      editor.off('transaction', updateMenu);
    };
  }, [editor, isOpen]);

  // Click outside to dismiss
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking on the menu itself
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }

      // PHASE 5: Don't close if clicking inside the editor - let view.update handle it
      // Only close if clicking completely outside (other UI elements)
      const editorElement = editor.view.dom;
      if (editorElement.contains(e.target as Node)) {
        return; // Let the view update logic handle editor clicks
      }

      // Clicking outside both menu and editor - close immediately
      const storage = (editor.storage as any).slashCommands;
      storage.isOpen = false;
      storage.manuallyClosedAt = Date.now();
      editor.view.dispatch(editor.view.state.tr);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, editor]);

  // Prevent page scrolling when menu is open
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;

      // Prevent scrolling
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        // Restore scrolling
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';

        // Restore scroll position
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Scroll selected item into view - smooth scrolling with proper button targeting
  // MUST be before early return to follow Rules of Hooks
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const container = menuRef.current;

    // Find all button elements (commands)
    const buttons = container.querySelectorAll('button');
    const selectedButton = buttons[selectedIndex];

    if (selectedButton) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();

      const isAboveView = buttonRect.top < containerRect.top;
      const isBelowView = buttonRect.bottom > containerRect.bottom;

      if (isAboveView || isBelowView) {
        selectedButton.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [isOpen, selectedIndex, query]);

  if (!isOpen || !position || !editor) {
    return null;
  }

  const commands = filterSlashCommands(query);

  const handleSelect = (index: number) => {
    const command = commands[index];
    if (!command) return;

    const storage = (editor.storage as any).slashCommands;
    const { from } = editor.state.selection;
    const range = { from: storage.startPos, to: from };

    // Close menu
    storage.isOpen = false;

    // Execute command with slash range - command handles everything in ONE transaction
    command.execute(editor, range);
  };

  // PHASE 5: Group commands by category
  const groupLabels: Record<CommandGroup, string> = {
    text: 'Basic Blocks',
    lists: 'Lists',
    media: 'Media',
    callouts: 'Callouts',
  };

  // Group commands for rendering
  const groupedCommands =
    query === ''
      ? commands.reduce(
          (acc, cmd) => {
            if (!acc[cmd.group]) {
              acc[cmd.group] = [];
            }
            acc[cmd.group].push(cmd);
            return acc;
          },
          {} as Record<CommandGroup, SlashCommand[]>
        )
      : null;

  // When searching, show flat list (no groups)
  const shouldShowGroups = query === '' && groupedCommands;

  return (
    <>
      {/* Custom scrollbar styles */}
      <style>{`
        .slash-command-menu {
          scrollbar-width: thin;
          scrollbar-color: ${colors.border.default} transparent;
        }
        .slash-command-menu::-webkit-scrollbar {
          width: 6px;
        }
        .slash-command-menu::-webkit-scrollbar-track {
          background: transparent;
        }
        .slash-command-menu::-webkit-scrollbar-thumb {
          background-color: ${colors.border.default};
          border-radius: 3px;
        }
        .slash-command-menu::-webkit-scrollbar-thumb:hover {
          background-color: ${colors.border.focus};
        }
      `}</style>
      <div
        ref={menuRef}
        className="slash-command-menu"
        style={{
          position: 'absolute',
          top: '24px',
          left: 0,
          backgroundColor: colors.background.default,
          border: `1px solid ${colors.border.default}`,
          borderRadius: sizing.radius.lg,
          boxShadow: `0 ${spacing['4']} ${spacing['12']} ${colors.shadow.md}`,
          zIndex: sizing.zIndex.dropdown,
          padding: spacing['4'],
          width: '240px', // PHASE 5: Fixed width for consistency
          // Exactly 6 items (measured: ~47px per item * 6 + 8px container padding)
          maxHeight: '310px',
          overflowY: 'auto',
          scrollBehavior: 'smooth', // PHASE 5: Smooth scrolling
        }}
      >
        {shouldShowGroups
          ? // PHASE 5: Render grouped commands with labels
            Object.entries(groupedCommands!).map(
              ([groupKey, groupCommands], groupIndex) => {
                const group = groupKey as CommandGroup;

                return (
                  <div key={group}>
                    {/* Group Label */}
                    <div
                      style={{
                        padding: `${spacing['4']} ${spacing['8']}`,
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.text.tertiary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginTop: groupIndex > 0 ? spacing['6'] : 0,
                      }}
                    >
                      {groupLabels[group]}
                    </div>

                    {/* Commands in this group */}
                    {groupCommands.map((command) => {
                      const globalIndex = commands.indexOf(command);
                      const Icon = (Icons as any)[command.icon];
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <button
                          key={command.id}
                          type="button"
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: spacing['6'],
                            padding: `${spacing['6']} ${spacing['8']}`,
                            borderRadius: sizing.radius.sm,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: isSelected
                              ? colors.background.hover
                              : 'transparent',
                            color: isSelected
                              ? colors.text.default
                              : colors.text.secondary,
                            transition:
                              'background-color 150ms cubic-bezier(0.2, 0, 0, 1)',
                            textAlign: 'left',
                          }}
                          onMouseEnter={() => {
                            (
                              editor.storage as any
                            ).slashCommands.selectedIndex = globalIndex;
                            setSelectedIndex(globalIndex);
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent focus loss
                          }}
                          onClick={() => handleSelect(globalIndex)}
                        >
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: colors.text.tertiary,
                              // marginTop: '1px', // Align icon with title text line
                            }}
                          >
                            {Icon && <Icon size={16} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '14px',
                                fontWeight: 500,
                                color: isSelected
                                  ? colors.text.default
                                  : colors.text.secondary,
                                lineHeight: '20px',
                              }}
                            >
                              {command.title}
                            </div>
                            <div
                              style={{
                                fontSize: '12px',
                                color: colors.text.tertiary,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {command.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              }
            )
          : // PHASE 5: Render flat list when searching
            commands.map((command, index) => {
              const Icon = (Icons as any)[command.icon];
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={command.id}
                  type="button"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing['6'],
                    padding: `${spacing['6']} ${spacing['8']}`,
                    borderRadius: sizing.radius.sm,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? colors.background.hover
                      : 'transparent',
                    color: isSelected
                      ? colors.text.default
                      : colors.text.secondary,
                    transition:
                      'background-color 150ms cubic-bezier(0.2, 0, 0, 1)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={() => {
                    (editor.storage as any).slashCommands.selectedIndex = index;
                    setSelectedIndex(index);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent focus loss
                  }}
                  onClick={() => handleSelect(index)}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: colors.text.tertiary,
                      marginTop: '1px', // Align icon with title text line
                    }}
                  >
                    {Icon && <Icon size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: isSelected
                          ? colors.text.default
                          : colors.text.secondary,
                        lineHeight: 1.5,
                      }}
                    >
                      {command.title}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: colors.text.tertiary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {command.description}
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </>
  );
}
