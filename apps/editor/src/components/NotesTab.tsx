import { Fragment, useState } from 'react';

import { CountBadge } from './CountBadge';
import { InteractiveItem } from './InteractiveItem';
import { SidebarHoverReveal } from './SidebarHoverReveal';
import { Section, Group } from './section';
import { SidebarPanel } from './SidebarPanel';
import { CustomIcons, type ClutterIcon } from '../design-system/icons';

type NavId = 'all-notes' | 'templates' | 'inbox';
type ContentSectionId = 'favorites' | 'folders';

type NavItem = {
  id: NavId;
  label: string;
  icon: ClutterIcon;
};

type NotesTreeItem = {
  id: string;
  label: string;
  icon: ClutterIcon;
  kind: 'note' | 'folder';
  children?: NotesTreeItem[];
};

/**
 * Folder badge count for the loaded tree (recursive note count).
 *
 * FUTURE: Replace with `noteCount` (or equivalent) from the data layer when folders
 * are lazy-loaded — do not rely on walking `children` for totals the API has not
 * sent yet. Keep this helper for demo/mock trees only until then.
 */
function getFolderNoteCount(folder: NotesTreeItem): number {
  if (folder.kind !== 'folder') {
    return 0;
  }

  let total = 0;

  for (const child of folder.children ?? []) {
    if (child.kind === 'note') {
      total += 1;
    } else {
      total += getFolderNoteCount(child);
    }
  }

  return total;
}

type NotesDestination =
  | { kind: 'nav'; id: NavId }
  | { kind: 'section'; id: ContentSectionId }
  | { kind: 'tree'; id: string };

const NAV_ITEMS: NavItem[] = [
  { id: 'all-notes', label: 'All Notes', icon: CustomIcons.Note },
  { id: 'templates', label: 'Templates', icon: CustomIcons.Template },
  { id: 'inbox', label: 'Inbox', icon: CustomIcons.Tray },
];

const FAVORITES_TREE: NotesTreeItem[] = [
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    kind: 'note',
    icon: CustomIcons.Note,
  },
  {
    id: 'projects',
    label: 'Projects',
    kind: 'folder',
    icon: CustomIcons.Folder,
    children: [
      {
        id: 'projects-brief',
        label: 'Product brief',
        kind: 'note',
        icon: CustomIcons.Note,
      },
      {
        id: 'projects-archive',
        label: 'Archive',
        kind: 'folder',
        icon: CustomIcons.Folder,
        children: [],
      },
    ],
  },
];

const FOLDERS_TREE: NotesTreeItem[] = [
  {
    id: 'folder-work',
    label: 'Work',
    kind: 'folder',
    icon: CustomIcons.Folder,
    children: [],
  },
  {
    id: 'folder-personal',
    label: 'Personal',
    kind: 'folder',
    icon: CustomIcons.Folder,
    children: [
      {
        id: 'folder-personal-journal',
        label: 'Journal',
        kind: 'note',
        icon: CustomIcons.Note,
      },
    ],
  },
];

type NotesTreeRowProps = {
  item: NotesTreeItem;
  depth?: number;
  destination: NotesDestination;
  expandedTreeIds: Record<string, boolean>;
  onSelectTreeItem: (id: string) => void;
  onToggleTreeExpand: (id: string) => void;
};

function NotesTreeRow({
  item,
  depth = 0,
  destination,
  expandedTreeIds,
  onSelectTreeItem,
  onToggleTreeExpand,
}: NotesTreeRowProps) {
  const isFolder = item.kind === 'folder';
  const childCount = item.children?.length ?? 0;
  const hasChildren = isFolder && childCount > 0;
  const isExpanded = expandedTreeIds[item.id] ?? false;
  const folderCount = isFolder ? getFolderNoteCount(item) : 0;

  return (
    <Fragment>
      <InteractiveItem
        variant="default"
        indentDepth={depth}
        hasInlineSlot={!isFolder}
        hasInlineCaret={isFolder}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onExpandToggle={
          isFolder ? () => onToggleTreeExpand(item.id) : undefined
        }
        active={destination.kind === 'tree' && destination.id === item.id}
        onClick={() => onSelectTreeItem(item.id)}
        startSlot={
          <div className="interactive-item__icon">
            <item.icon />
          </div>
        }
        endSlot={
          isFolder && folderCount > 0 ? (
            <SidebarHoverReveal>
              <CountBadge count={folderCount} />
            </SidebarHoverReveal>
          ) : undefined
        }
      >
        <span className="interactive-item__label">{item.label}</span>
      </InteractiveItem>

      {isFolder &&
        isExpanded &&
        item.children?.map((child) => (
          <NotesTreeRow
            key={child.id}
            item={child}
            depth={depth + 1}
            destination={destination}
            expandedTreeIds={expandedTreeIds}
            onSelectTreeItem={onSelectTreeItem}
            onToggleTreeExpand={onToggleTreeExpand}
          />
        ))}
    </Fragment>
  );
}

export function NotesTab() {
  const [destination, setDestination] = useState<NotesDestination>({
    kind: 'nav',
    id: 'all-notes',
  });
  const [expandedTreeIds, setExpandedTreeIds] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedSections, setExpandedSections] = useState<
    Record<ContentSectionId, boolean>
  >({
    favorites: true,
    folders: true,
  });

  const toggleSection = (sectionId: ContentSectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const toggleTreeExpand = (itemId: string) => {
    setExpandedTreeIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const navigation = (
    <Section title="Notes" hasGroups>
      <Group>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <InteractiveItem
              key={item.id}
              variant="default"
              active={destination.kind === 'nav' && destination.id === item.id}
              onClick={() => setDestination({ kind: 'nav', id: item.id })}
              startSlot={
                <div className="interactive-item__icon">
                  <Icon />
                </div>
              }
            >
              <span className="interactive-item__label">{item.label}</span>
            </InteractiveItem>
          );
        })}
      </Group>
    </Section>
  );

  return (
    <SidebarPanel navigation={navigation}>
      <Section
        title="Favorites"
        collapsible
        isExpanded={expandedSections.favorites}
        onToggle={() => toggleSection('favorites')}
        active={
          destination.kind === 'section' && destination.id === 'favorites'
        }
        onClick={() => setDestination({ kind: 'section', id: 'favorites' })}
        hasGroups
      >
        <Group>
          {FAVORITES_TREE.map((item) => (
            <NotesTreeRow
              key={item.id}
              item={item}
              destination={destination}
              expandedTreeIds={expandedTreeIds}
              onSelectTreeItem={(id) => setDestination({ kind: 'tree', id })}
              onToggleTreeExpand={toggleTreeExpand}
            />
          ))}
        </Group>
      </Section>

      <Section
        title="Folders"
        collapsible
        isExpanded={expandedSections.folders}
        onToggle={() => toggleSection('folders')}
        active={destination.kind === 'section' && destination.id === 'folders'}
        onClick={() => setDestination({ kind: 'section', id: 'folders' })}
        hasGroups
      >
        <Group>
          {FOLDERS_TREE.map((item) => (
            <NotesTreeRow
              key={item.id}
              item={item}
              destination={destination}
              expandedTreeIds={expandedTreeIds}
              onSelectTreeItem={(id) => setDestination({ kind: 'tree', id })}
              onToggleTreeExpand={toggleTreeExpand}
            />
          ))}
        </Group>
      </Section>
    </SidebarPanel>
  );
}
