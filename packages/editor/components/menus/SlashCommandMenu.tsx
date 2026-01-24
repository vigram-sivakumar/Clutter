/**
 * Slash Command Menu Component
 * Renders the command menu with shared dropdown primitives
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { DropdownContainer } from '@clutter/ui';
import {
  filterSlashCommands,
  type SlashCommand,
  type CommandGroup,
} from '../plugins/SlashCommands';
import { useCommandPickerNavigation } from '../hooks/useCommandPickerNavigation';
import { CommandList } from '../shared/CommandList';

interface SlashCommandMenuProps {
  editor: Editor | null;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const { colors: _colors } = useEditorTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Filtered commands based on query (must be before hook)
  const commands = useMemo(() => filterSlashCommands(query), [query]);

  // Convert SlashCommand to CommandItem format for CommandList
  const commandItems = useMemo(() => {
    return commands.map((cmd: SlashCommand) => ({
      id: cmd.id,
      title: cmd.title,
      description: cmd.description,
      icon: cmd.icon,
      group: cmd.group,
    }));
  }, [commands]);

  // Handle command selection
  const handleSelect = (index: number) => {
    const command = commands[index];
    if (!command || !editor) return;

    const storage = (editor.storage as any).slashCommands;
    const { from } = editor.state.selection;
    const range = { from: storage.startPos, to: from };

    // Close menu
    storage.isOpen = false;

    // Execute command with slash range
    command.execute(editor, range);
  };

  // Keyboard navigation using shared hook
  const { selectedIndex, setSelectedIndex, hasKeyboardNavigatedRef } = useCommandPickerNavigation({
    isActive: isOpen,
    itemCount: commands.length,
    onSelect: handleSelect,
    containerRef,
  });

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
      // Note: selectedIndex is now managed by useCommandPickerNavigation hook

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

  // Sync hook's selected index back to editor storage
  // This maintains compatibility with the plugin
  useEffect(() => {
    if (!editor || !isOpen) return;
    const storage = (editor.storage as any).slashCommands;
    if (storage) {
      storage.selectedIndex = selectedIndex;
    }
  }, [selectedIndex, editor, isOpen]);

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

  // Group labels for command categories
  const groupLabels: Record<CommandGroup, string> = {
    text: 'Basic Blocks',
    lists: 'Lists',
    media: 'Media',
    callouts: 'Callouts',
  };

  if (!isOpen || !position || !editor) {
    return null;
  }

  return (
    <DropdownContainer
      isOpen={isOpen}
      position={{ top: position.top, left: position.left }}
      onClose={handleClose}
      dismissOnEscape={true}
    >
      <div ref={containerRef}>
        <CommandList
          items={commandItems}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onItemHover={(index) => {
            // Gate hover updates after keyboard navigation starts (ownership enforcement)
            if (hasKeyboardNavigatedRef.current) return;
            
            // Sync to editor storage for plugin compatibility
            if (editor) {
              (editor.storage as any).slashCommands.selectedIndex = index;
            }
            setSelectedIndex(index);
          }}
          showGroups={query === ''}
          groupLabels={groupLabels}
        />
      </div>
    </DropdownContainer>
  );
}