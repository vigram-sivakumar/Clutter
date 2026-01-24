/**
 * Slash Command Menu Component
 * Renders the command menu with shared dropdown primitives
 */

import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorTheme } from '../theme/EditorThemeContext';
import * as Icons from '@clutter/ui';
import {
  DropdownContainer,
  DropdownHeader,
  DropdownItem,
  DropdownSeparator,
} from '@clutter/ui';
import {
  filterSlashCommands,
  type SlashCommand,
  type CommandGroup,
} from '../plugins/SlashCommands';

interface SlashCommandMenuProps {
  editor: Editor | null;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const { colors: _colors } = useEditorTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Handle close event from DropdownContainer (click-outside or ESC)
  const handleClose = () => {
    if (!editor) return;
    const storage = (editor.storage as any).slashCommands;
    storage.isOpen = false;
    storage.userClosed = true; // Prevent auto-reopening
    storage.manuallyClosedAt = Date.now();
    // 🔒 Preserve selection when dispatching signal transaction
    const tr = editor.view.state.tr;
    tr.setSelection(editor.view.state.selection);
    editor.view.dispatch(tr);
  };

  // Scroll selected item into view
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const items = containerRef.current.querySelectorAll('button');
    const selectedItem = items[selectedIndex];

    if (selectedItem) {
      selectedItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isOpen, selectedIndex, query]);

  // Global keyboard handler to intercept Enter/Arrow keys before structural handlers
  // This is necessary because KeyboardShortcuts extension runs before SlashCommands
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const storage = (editor.storage as any).slashCommands;
      if (!storage?.isOpen) return;

      const commands = filterSlashCommands(storage.query);
      if (commands.length === 0) return;

      // Intercept Enter/Arrow keys in capture phase
      if (['Enter', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (event.key === 'Enter') {
          const command = commands[storage.selectedIndex];
          if (command) {
            const { from } = editor.state.selection;
            const range = { from: storage.startPos, to: from };
            storage.isOpen = false;
            command.execute(editor, range);
          }
        } else if (event.key === 'ArrowDown') {
          storage.selectedIndex = Math.min(storage.selectedIndex + 1, commands.length - 1);
          setSelectedIndex(storage.selectedIndex);
          editor.view.dispatch(editor.state.tr);
        } else if (event.key === 'ArrowUp') {
          storage.selectedIndex = Math.max(storage.selectedIndex - 1, 0);
          setSelectedIndex(storage.selectedIndex);
          editor.view.dispatch(editor.state.tr);
        } else if (event.key === 'Tab') {
          const command = commands[0];
          if (command) {
            const { from } = editor.state.selection;
            const range = { from: storage.startPos, to: from };
            storage.isOpen = false;
            command.execute(editor, range);
          }
        }
      }
    };

    // Use capture phase to intercept before structural handlers
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, editor]);

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
    <DropdownContainer
      isOpen={isOpen}
      position={{ top: position.top, left: position.left }}
      onClose={handleClose}
      dismissOnEscape={true}
      minWidth="240px"
      maxWidth="240px"
      maxHeight="310px"
    >
      <div ref={containerRef}>
        {shouldShowGroups
          ? // Render grouped commands with section headers
            Object.entries(groupedCommands!).map(
              ([groupKey, groupCommands], groupIndex) => {
                const group = groupKey as CommandGroup;

                return (
                  <div key={group}>
                    {groupIndex > 0 && (
                      <DropdownSeparator key={`separator-${group}`} />
                    )}
                    <DropdownHeader label={groupLabels[group]} />

                    {groupCommands.map((command) => {
                      const globalIndex = commands.indexOf(command);
                      const Icon = (Icons as any)[command.icon];
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <DropdownItem
                          key={command.id}
                          icon={Icon ? <Icon size={16} /> : undefined}
                          label={command.title}
                          isSelected={isSelected}
                          onClick={() => handleSelect(globalIndex)}
                          onMouseEnter={() => {
                            (
                              editor.storage as any
                            ).slashCommands.selectedIndex = globalIndex;
                            setSelectedIndex(globalIndex);
                          }}
                        />
                      );
                    })}
                  </div>
                );
              }
            )
          : // Render flat list when searching
            commands.map((command, index) => {
              const Icon = (Icons as any)[command.icon];
              const isSelected = index === selectedIndex;

              return (
                <DropdownItem
                  key={command.id}
                  icon={Icon ? <Icon size={16} /> : undefined}
                  label={command.title}
                  isSelected={isSelected}
                  onClick={() => handleSelect(index)}
                  onMouseEnter={() => {
                    (editor.storage as any).slashCommands.selectedIndex = index;
                    setSelectedIndex(index);
                  }}
                />
              );
            })}
      </div>
    </DropdownContainer>
  );
}