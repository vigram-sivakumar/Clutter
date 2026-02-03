/**
 * @Mention Menu Component
 *
 * Shows 3 sections using shared dropdown primitives:
 * 1. DATE - Date mentions
 * 2. DAILY NOTE - Create or link to daily note
 * 3. LINK TO - Regular notes and folders
 *
 * Exact visual recreation of old ProseMirror AtMentionMenu.
 */

import {
  AutocompleteDropdown,
  DropdownItem,
  DropdownHeader,
  DropdownSeparator,
  At,
  CalendarBlank,
  Note,
  Folder,
} from '@clutter/ui';
import type { DateSuggestion } from '../utils/dateParser';
import type { EntitySuggestion } from '../utils/entitySearch';

export interface AtMentionMenuProps {
  query: string;
  selectedIndex: number;
  position: { top: number; left: number };
  onClose: () => void;
  dateSuggestions: DateSuggestion[];
  entityMatches: EntitySuggestion[];
  showCreateNote: boolean;
  showCreateFolder: boolean;
  onSelect: (item: MenuItem) => void;
}

export type MenuItem =
  | { type: 'date'; suggestion: DateSuggestion }
  | { type: 'createDailyNote'; date: DateSuggestion }
  | { type: 'entity'; suggestion: EntitySuggestion }
  | { type: 'createNote'; query: string }
  | { type: 'createFolder'; query: string };

export function AtMentionMenu({
  query,
  selectedIndex,
  position,
  onClose,
  dateSuggestions,
  entityMatches,
  showCreateNote,
  showCreateFolder,
  onSelect,
}: AtMentionMenuProps) {
  // Build complete menu items list
  const menuItems: MenuItem[] = [];

  // 1. DATE section - pure date mention
  if (dateSuggestions.length > 0) {
    const dateSuggestion = dateSuggestions[0];
    menuItems.push({ type: 'date', suggestion: dateSuggestion });
  }

  // 2. DAILY NOTE section - create or link to existing daily note
  // TODO: Check if daily note exists via callback
  if (dateSuggestions.length > 0) {
    menuItems.push({
      type: 'createDailyNote',
      date: dateSuggestions[0],
    });
  }

  // 3. LINK TO section - regular notes and folders (excluding daily notes)
  const regularMatches = entityMatches.filter((s) => !s.isDailyNote);

  regularMatches.forEach((suggestion) => {
    menuItems.push({ type: 'entity', suggestion });
  });

  // Create options
  if (showCreateNote) {
    menuItems.push({ type: 'createNote', query });
  }
  if (showCreateFolder) {
    menuItems.push({ type: 'createFolder', query });
  }

  // No results
  if (menuItems.length === 0) {
    return (
      <AutocompleteDropdown
        isOpen={true}
        position={position}
        onClose={onClose}
        selectedIndex={-1}
      >
        <div style={{ padding: '12px', fontSize: '14px', opacity: 0.6 }}>
          No matches
        </div>
      </AutocompleteDropdown>
    );
  }

  // Render menu items with sections
  const renderMenuItems = () => {
    const items: JSX.Element[] = [];
    let hasRenderedDateSection = false;
    let hasRenderedDailyNoteSection = false;
    let inLinkSection = false;
    let itemIndex = 0;

    menuItems.forEach((item) => {
      // Add DATE header before first date item
      if (item.type === 'date' && !hasRenderedDateSection) {
        items.push(<DropdownHeader key="date-header" label="DATE" />);
        hasRenderedDateSection = true;
      }

      // Add DAILY NOTE header before first daily note item
      if (
        !hasRenderedDailyNoteSection &&
        (item.type === 'createDailyNote' ||
          (item.type === 'entity' && item.suggestion.isDailyNote))
      ) {
        hasRenderedDailyNoteSection = true;
        if (hasRenderedDateSection) {
          items.push(<DropdownSeparator key="separator-daily" />);
        }
        items.push(
          <DropdownHeader key="daily-note-header" label="DAILY NOTE" />
        );
      }

      // Add LINK TO header before first entity/create item (non-daily-note)
      if (
        !inLinkSection &&
        ((item.type === 'entity' && !item.suggestion.isDailyNote) ||
          item.type === 'createNote' ||
          item.type === 'createFolder')
      ) {
        inLinkSection = true;
        if (hasRenderedDateSection || hasRenderedDailyNoteSection) {
          items.push(<DropdownSeparator key="separator-link" />);
        }
        items.push(<DropdownHeader key="link-header" label="LINK TO" />);
      }

      // Render item
      switch (item.type) {
        case 'date':
          items.push(
            <DropdownItem
              key={`date-${itemIndex}`}
              icon={<At />}
              label={item.suggestion.label}
              description={item.suggestion.description}
              isSelected={selectedIndex === itemIndex}
              onClick={() => onSelect(item)}
            />
          );
          break;

        case 'createDailyNote':
          items.push(
            <DropdownItem
              key={`create-daily-${itemIndex}`}
              icon={<CalendarBlank />}
              label={`Create "${item.date.label}"`}
              isSelected={selectedIndex === itemIndex}
              onClick={() => onSelect(item)}
            />
          );
          break;

        case 'entity': {
          const { suggestion } = item;
          const icon = suggestion.isDailyNote ? (
            <CalendarBlank />
          ) : suggestion.type === 'folder' ? (
            <Folder />
          ) : (
            <Note />
          );
          const emoji = suggestion.emoji;
          const displayLabel = emoji
            ? `${emoji} ${suggestion.title}`
            : suggestion.title;

          items.push(
            <DropdownItem
              key={`entity-${itemIndex}`}
              icon={!emoji ? icon : undefined}
              label={displayLabel}
              isSelected={selectedIndex === itemIndex}
              onClick={() => onSelect(item)}
            />
          );
          break;
        }

        case 'createNote':
          items.push(
            <DropdownItem
              key={`create-note-${itemIndex}`}
              icon={<Note />}
              label={`Create "${item.query}"`}
              isSelected={selectedIndex === itemIndex}
              onClick={() => onSelect(item)}
            />
          );
          break;

        case 'createFolder':
          items.push(
            <DropdownItem
              key={`create-folder-${itemIndex}`}
              icon={<Folder />}
              label={`Create "${item.query}"`}
              isSelected={selectedIndex === itemIndex}
              onClick={() => onSelect(item)}
            />
          );
          break;
      }

      itemIndex++;
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
      {renderMenuItems()}
    </AutocompleteDropdown>
  );
}
