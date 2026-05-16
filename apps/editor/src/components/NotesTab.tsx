import { useState } from 'react';

import { InteractiveItem } from './InteractiveItem';
import { Section, Group } from './section';
import { SidebarPanel } from './SidebarPanel';
import { CustomIcons, type ClutterIcon } from '../design-system/icons';

type NavId = 'all-notes' | 'templates' | 'inbox';
type ContentSectionId = 'favorites' | 'folders';
type FavoriteTreeItemId = 'meeting-notes' | 'projects';

type NavItem = {
  id: NavId;
  label: string;
  icon: ClutterIcon;
};

type NotesDestination =
  | { kind: 'nav'; id: NavId }
  | { kind: 'section'; id: ContentSectionId }
  | { kind: 'tree'; id: FavoriteTreeItemId };

const NAV_ITEMS: NavItem[] = [
  { id: 'all-notes', label: 'All Notes', icon: CustomIcons.Note },
  { id: 'templates', label: 'Templates', icon: CustomIcons.Template },
  { id: 'inbox', label: 'Inbox', icon: CustomIcons.Tray },
];

export function NotesTab() {
  const [destination, setDestination] = useState<NotesDestination>({
    kind: 'nav',
    id: 'all-notes',
  });
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
          <InteractiveItem
            variant="default"
            hasInlineSlot
            active={
              destination.kind === 'tree' && destination.id === 'meeting-notes'
            }
            onClick={() =>
              setDestination({ kind: 'tree', id: 'meeting-notes' })
            }
            startSlot={
              <div className="interactive-item__icon">
                <CustomIcons.Note />
              </div>
            }
          >
            <span className="interactive-item__label">Meeting notes</span>
          </InteractiveItem>

          <InteractiveItem
            variant="default"
            hasInlineCaret
            hasChildren={false}
            active={
              destination.kind === 'tree' && destination.id === 'projects'
            }
            onClick={() => setDestination({ kind: 'tree', id: 'projects' })}
            startSlot={
              <div className="interactive-item__icon">
                <CustomIcons.Folder />
              </div>
            }
          >
            <span className="interactive-item__label">Projects</span>
          </InteractiveItem>
        </Group>
      </Section>

      <Section
        title="Folders"
        collapsible
        isExpanded={expandedSections.folders}
        onToggle={() => toggleSection('folders')}
        active={destination.kind === 'section' && destination.id === 'folders'}
        onClick={() => setDestination({ kind: 'section', id: 'folders' })}
        hasGroups={false}
        emptyMessage="No folders yet"
      />
    </SidebarPanel>
  );
}
