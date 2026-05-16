import { useState } from 'react';

import { SidebarPanel } from './SidebarPanel';
import { SidebarSection, SidebarGroup } from './SidebarSection';
import { InteractiveItem } from './InteractiveItem';
import { CustomIcons as Icons } from '../design-system/icons';

type SidebarItemType = 'navigation' | 'default';

type SidebarItem = {
  id: string;
  label: string;
  type: SidebarItemType;
  icon?: React.ComponentType;
};

type SidebarGroupData = {
  subheader?: string;
  items: SidebarItem[];
};

type SidebarSectionData = {
  id: string;
  header: string;
  groups: SidebarGroupData[];
};

const navigationSection: SidebarSectionData = {
  id: 'notes',
  header: 'Notes',

  groups: [
    {
      items: [
        {
          id: 'all-notes',
          label: 'All Notes',
          type: 'navigation',
          icon: Icons.Note,
        },

        {
          id: 'templates',
          label: 'Templates',
          type: 'navigation',
          icon: Icons.Template,
        },

        {
          id: 'inbox',
          label: 'Inbox',
          type: 'navigation',
          icon: Icons.Tray,
        },
      ],
    },
  ],
};

const favoritesSection: SidebarSectionData = {
  id: 'favorites',
  header: 'Favorites',

  groups: [
    {
      items: [
        {
          id: 'note-1',
          label: 'Product Roadmap',
          type: 'default',
          icon: Icons.Note,
        },
      ],
    },
  ],
};

const foldersSection: SidebarSectionData = {
  id: 'folders',
  header: 'All folders',

  groups: [
    {
      items: [],
    },
  ],
};

const contentSections: SidebarSectionData[] = [
  favoritesSection,
  foldersSection,
];

export function NotesSidebar() {
  const [activeItem, setActiveItem] = useState('all-notes');

  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({
    favorites: false,
    folders: false,
  });

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const renderGroupItems = (group: SidebarGroupData) => {
    return group.items.map((item) => {
      const Icon = item.icon;
      return (
        <InteractiveItem
          key={item.id}
          active={activeItem === item.id}
          onClick={() => setActiveItem(item.id)}
          variant="navigation"
          icon={Icon ? <Icon /> : undefined}
        >
          <span className="interactive-item__label">{item.label}</span>
        </InteractiveItem>
      );
    });
  };

  return (
    <SidebarPanel
      navigation={
        <SidebarSection
          title={navigationSection.header}
          isExpanded
          hasChildren
          onToggle={() => {}}
        >
          {navigationSection.groups.map((group, groupIndex) => (
            <SidebarGroup key={`${navigationSection.id}-${groupIndex}`}>
              {renderGroupItems(group)}
            </SidebarGroup>
          ))}
        </SidebarSection>
      }
    >
      {contentSections.map((section) => {
        const isExpanded = !collapsedSections[section.id];

        return (
          <SidebarSection
            key={section.id}
            title={section.header}
            isExpanded={isExpanded}
            hasChildren={section.groups.some((group) => group.items.length > 0)}
            emptyMessage="No folders yet"
            onToggle={() => toggleSection(section.id)}
          >
            {section.groups.map((group, groupIndex) => (
              <SidebarGroup key={`${section.id}-${groupIndex}`}>
                {renderGroupItems(group)}
              </SidebarGroup>
            ))}
          </SidebarSection>
        );
      })}
    </SidebarPanel>
  );
}
