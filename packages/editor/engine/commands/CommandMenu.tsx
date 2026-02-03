/**
 * Command Menu Component
 *
 * Displays slash commands using shared dropdown primitives.
 * Exact visual match to old ProseMirror SlashCommandMenu with category grouping.
 */

import {
  AutocompleteDropdown,
  DropdownItem,
  DropdownHeader,
  DropdownSeparator,
  useTheme,
} from '@clutter/ui';
import type { SlashCommand, CommandCategory } from './types';

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

  // Group commands by category
  const groupedCommands: {
    category: CommandCategory;
    commands: SlashCommand[];
  }[] = [];
  const categoryLabels: Record<CommandCategory, string> = {
    basic: 'BASIC BLOCKS',
    lists: 'LISTS',
    decoratives: 'DECORATIVES',
  };

  // Build grouped structure
  commands.forEach((command) => {
    const existingGroup = groupedCommands.find(
      (g) => g.category === command.category
    );
    if (existingGroup) {
      existingGroup.commands.push(command);
    } else {
      groupedCommands.push({ category: command.category, commands: [command] });
    }
  });

  // Render with grouping
  const renderItems = () => {
    const items: JSX.Element[] = [];
    let globalIndex = 0;

    groupedCommands.forEach((group, groupIndex) => {
      // Add separator before new category (except first)
      if (groupIndex > 0) {
        items.push(<DropdownSeparator key={`separator-${group.category}`} />);
      }

      // Add category header
      items.push(
        <DropdownHeader
          key={`header-${group.category}`}
          label={categoryLabels[group.category]}
        />
      );

      // Add commands in this category
      group.commands.forEach((command) => {
        const isSelected = globalIndex === selectedIndex;
        items.push(
          <DropdownItem
            key={command.id}
            label={command.label}
            description={command.description}
            icon={command.icon}
            isSelected={isSelected}
            onClick={() => onSelect(command)}
          />
        );
        globalIndex++;
      });
    });

    return items;
  };

  return (
    <AutocompleteDropdown
      isOpen={true}
      position={position}
      onClose={onClose}
      selectedIndex={selectedIndex}
    >
      {renderItems()}
    </AutocompleteDropdown>
  );
}
