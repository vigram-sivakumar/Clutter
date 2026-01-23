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
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe to editor storage changes
  useEffect(() => {
    if (!editor) return;

    let cachedPosition: { top?: number; bottom?: number; left: number } | null = null;
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

      // Calculate position when opening OR when startPos changes
      // FloatingMenu handles collision detection and flip logic
      if (isNowOpen) {
        const startPosChanged = cachedStartPos !== currentStartPos;

        if (!wasOpen || startPosChanged) {
          // Check if we have a custom position (opened from block menu)
          if (storage.customPosition) {
            // Use the custom position from block menu
            cachedPosition = storage.customPosition;
          } else {
            // Normal slash command - position at cursor
            const coords = editor.view.coordsAtPos(currentStartPos);
            cachedPosition = {
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
            };
          }
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
    storage.openedFromBlockMenu = false; // Reset flag
    storage.blockMenuCallback = null; // Clear callback
    storage.customPosition = null; // Clear custom position
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
    storage.openedFromBlockMenu = false; // Reset flag
    storage.blockMenuCallback = null; // Clear callback
    storage.customPosition = null; // Clear custom position

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

  // Check if opened from block menu
  const storage = editor ? (editor.storage as any).slashCommands : null;
  const openedFromBlockMenu = storage?.openedFromBlockMenu || false;

  // Handle back button click
  const handleBack = () => {
    if (!editor) return;
    const storage = (editor.storage as any).slashCommands;
    
    // Close slash menu and reset state
    storage.isOpen = false;
    storage.openedFromBlockMenu = false;
    storage.customPosition = null;
    
    // Dispatch transaction to trigger UI updates
    const tr = editor.view.state.tr;
    tr.setMeta('closeSlashMenu', true);
    editor.view.dispatch(tr);
    
    // Call the callback to reopen block menu
    if (storage.blockMenuCallback) {
      storage.blockMenuCallback();
      storage.blockMenuCallback = null;
    }
  };

  return (
    <DropdownContainer
      isOpen={isOpen}
      position={position}
      onClose={handleClose}
      dismissOnEscape={true}
      minWidth="240px"
      maxWidth="240px"
      maxHeight="310px"
    >
      <div ref={containerRef}>
        {/* Back button when opened from block menu */}
        {openedFromBlockMenu && (
          <>
            <DropdownItem
              icon={<Icons.ChevronLeft size={16} />}
              label="Back to block options"
              onClick={handleBack}
            />
            <DropdownSeparator />
          </>
        )}
        
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
