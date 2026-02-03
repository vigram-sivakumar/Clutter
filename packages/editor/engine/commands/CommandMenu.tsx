/**
 * Command Menu Component
 *
 * Displays slash commands using shared dropdown primitives.
 * Exact visual match to old ProseMirror SlashCommandMenu.
 */

import { AutocompleteDropdown, DropdownItem, useTheme } from '@clutter/ui';
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

  /** Callback to close menu */
  onClose: () => void;
}

/**
 * Command menu UI using shared dropdown primitives
 *
 * Dimensions from DropdownContainer defaults:
 * - width: 220px
 * - minWidth: 180px
 * - maxHeight: 70vh
 * - item height: 28px (from DropdownItem)
 */
export function CommandMenu({
  commands,
  selectedIndex,
  onSelect,
  position,
  query,
  onClose,
}: CommandMenuProps) {
  const { colors } = useTheme();

  // No results state
  if (commands.length === 0) {
    return (
      <AutocompleteDropdown
        isOpen={true}
        position={position}
        onClose={onClose}
        selectedIndex={-1}
      >
        <div
          style={{
            padding: '12px',
            color: colors.text.secondary,
            fontSize: '14px',
          }}
        >
          No commands found for "{query}"
        </div>
      </AutocompleteDropdown>
    );
  }

  return (
    <AutocompleteDropdown
      isOpen={true}
      position={position}
      onClose={onClose}
      selectedIndex={selectedIndex}
    >
      {commands.map((command, index) => (
        <DropdownItem
          key={command.id}
          label={command.label}
          description={command.description}
          icon={command.icon}
          isSelected={index === selectedIndex}
          onClick={() => onSelect(command)}
        />
      ))}
    </AutocompleteDropdown>
  );
}
