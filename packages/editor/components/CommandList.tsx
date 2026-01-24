/**
 * CommandList - Shared command rendering component
 *
 * Pure rendering component for displaying a list of commands with icons,
 * keyboard selection highlighting, and optional grouping.
 *
 * Used by:
 * - SlashCommandMenu (renders slash commands)
 * - BlockOptionsMenu "Turn into" view (renders block types)
 * - Future: Command Palette
 *
 * No keyboard logic here - that's handled by useCommandPickerNavigation hook.
 */

import * as Icons from '@clutter/ui';
import { DropdownHeader, DropdownItem, DropdownSeparator } from '@clutter/ui';

/**
 * Generic command item interface
 */
export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: string; // Lucide icon name
  group?: string; // Optional grouping
}

/**
 * Group definition for organizing commands
 */
export interface CommandGroup {
  key: string;
  label: string;
  items: CommandItem[];
}

export interface CommandListProps {
  /**
   * List of commands to render
   */
  items: CommandItem[];

  /**
   * Currently selected index (for keyboard highlighting)
   */
  selectedIndex: number;

  /**
   * Callback when an item is clicked
   */
  onSelect: (index: number) => void;

  /**
   * Optional: Group items by their 'group' property
   * If true, will organize items into sections with headers
   */
  showGroups?: boolean;

  /**
   * Optional: Custom group labels
   * Maps group keys to display labels
   */
  groupLabels?: Record<string, string>;

  /**
   * Optional: Callback when mouse enters an item
   * Used to sync selectedIndex with mouse hover
   */
  onItemHover?: (index: number) => void;
}

export function CommandList({
  items,
  selectedIndex,
  onSelect,
  showGroups = false,
  groupLabels = {},
  onItemHover,
}: CommandListProps) {
  // Group commands by their group property
  const groupedItems = showGroups
    ? items.reduce(
        (acc, item) => {
          const groupKey = item.group || 'other';
          if (!acc[groupKey]) {
            acc[groupKey] = [];
          }
          acc[groupKey].push(item);
          return acc;
        },
        {} as Record<string, CommandItem[]>
      )
    : null;

  // Render flat list (no grouping)
  if (!showGroups || !groupedItems) {
    return (
      <>
        {items.map((item, index) => {
          const Icon = item.icon ? (Icons as any)[item.icon] : null;
          const isSelected = index === selectedIndex;

          return (
            <DropdownItem
              key={item.id}
              icon={Icon ? <Icon size={16} /> : undefined}
              label={item.title}
              isSelected={isSelected}
              onClick={() => onSelect(index)}
              onMouseEnter={() => onItemHover?.(index)}
            />
          );
        })}
      </>
    );
  }

  // Render grouped list with section headers
  return (
    <>
      {Object.entries(groupedItems).map(([groupKey, groupItems], groupIndex) => {
        const groupLabel = groupLabels[groupKey] || groupKey;

        return (
          <div key={groupKey}>
            {groupIndex > 0 && <DropdownSeparator />}
            <DropdownHeader label={groupLabel} />

            {groupItems.map((item) => {
              const globalIndex = items.indexOf(item);
              const Icon = item.icon ? (Icons as any)[item.icon] : null;
              const isSelected = globalIndex === selectedIndex;

              return (
                <DropdownItem
                  key={item.id}
                  icon={Icon ? <Icon size={16} /> : undefined}
                  label={item.title}
                  isSelected={isSelected}
                  onClick={() => onSelect(globalIndex)}
                  onMouseEnter={() => onItemHover?.(globalIndex)}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
