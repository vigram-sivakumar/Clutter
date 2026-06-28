import { useState } from 'react';

import { CountBadge } from './CountBadge';
import { InteractiveItem } from './InteractiveItem';
import { Pill } from './Pill';
import { SidebarHoverReveal } from './SidebarHoverReveal';
import { Section, Group } from './oldsection';
import { SidebarPanel } from './SidebarPanel';
import type { TagPaletteId } from '../design-system/tag-colors';
import { Icons, type ClutterIcon } from '../design-system/icons';

type TagsNavId = 'all-tags' | 'untagged';
type TagsSectionId = 'favorites' | 'others';

type TagsDestination =
  | { kind: 'nav'; id: TagsNavId }
  | { kind: 'section'; id: TagsSectionId }
  | { kind: 'tag'; id: string };

type NavItem = {
  id: TagsNavId;
  label: string;
  icon: ClutterIcon;
};

type TagMock = {
  id: string;
  label: string;
  palette: TagPaletteId;
  favorite: boolean;
  count: number;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'all-tags', label: 'All tags', icon: Icons.Tag },
  { id: 'untagged', label: 'Untagged', icon: Icons.CircleDashed },
];

const TAG_MOCK_DATA: TagMock[] = [
  {
    id: 'project',
    label: 'Project',
    palette: 'blue',
    favorite: true,
    count: 4,
  },
  {
    id: 'finance',
    label: 'Finance',
    palette: 'green',
    favorite: true,
    count: 11,
  },
  {
    id: 'task',
    label: 'Task',
    palette: 'yellow',
    favorite: true,
    count: 7,
  },
  {
    id: 'travel',
    label: 'Travel',
    palette: 'purple',
    favorite: true,
    count: 3,
  },
  {
    id: 'people',
    label: 'People',
    palette: 'red',
    favorite: false,
    count: 0,
  },
  {
    id: 'resource',
    label: 'Resource',
    palette: 'purple',
    favorite: false,
    count: 0,
  },
  {
    id: 'archive',
    label: 'Archive',
    palette: 'grey',
    favorite: false,
    count: 23,
  },
  {
    id: 'bucket-list',
    label: 'Bucket list',
    palette: 'purple',
    favorite: false,
    count: 100,
  },
  {
    id: 'important',
    label: 'Important',
    palette: 'red',
    favorite: false,
    count: 1,
  },
  {
    id: 'work',
    label: 'Work',
    palette: 'grey',
    favorite: false,
    count: 9,
  },
];

function getTagsForSection(tags: TagMock[], favorite: boolean) {
  return tags.filter((tag) => tag.favorite === favorite);
}

type TagSidebarRowProps = {
  tag: TagMock;
  destination: TagsDestination;
  onSelectTag: (tagId: string) => void;
};

function TagSidebarRow({ tag, destination, onSelectTag }: TagSidebarRowProps) {
  return (
    <InteractiveItem
      variant="default"
      active={destination.kind === 'tag' && destination.id === tag.id}
      onClick={() => onSelectTag(tag.id)}
      endSlot={
        tag.count > 0 ? (
          <SidebarHoverReveal>
            <CountBadge count={tag.count} />
          </SidebarHoverReveal>
        ) : undefined
      }
    >
      <Pill label={tag.label} color={tag.palette} />
    </InteractiveItem>
  );
}

type TagListProps = {
  tags: TagMock[];
  destination: TagsDestination;
  onSelectTag: (tagId: string) => void;
};

function TagList({ tags, destination, onSelectTag }: TagListProps) {
  return (
    <>
      {tags.map((tag) => (
        <TagSidebarRow
          key={tag.id}
          tag={tag}
          destination={destination}
          onSelectTag={onSelectTag}
        />
      ))}
    </>
  );
}

export function TagsTabV2() {
  const [tags] = useState<TagMock[]>(TAG_MOCK_DATA);
  const [destination, setDestination] = useState<TagsDestination>({
    kind: 'nav',
    id: 'all-tags',
  });
  const [expandedSections, setExpandedSections] = useState<
    Record<TagsSectionId, boolean>
  >({
    favorites: true,
    others: true,
  });

  const favoriteTags = getTagsForSection(tags, true);
  const otherTags = getTagsForSection(tags, false);

  const toggleSection = (sectionId: TagsSectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const selectTag = (tagId: string) => {
    setDestination({ kind: 'tag', id: tagId });
  };

  const navigation = (
    <Section title="Tags" hasGroups>
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
        hasGroups={favoriteTags.length > 0}
        emptyMessage="No favorite tags yet"
      >
        {favoriteTags.length > 0 && (
          <Group>
            <TagList
              tags={favoriteTags}
              destination={destination}
              onSelectTag={selectTag}
            />
          </Group>
        )}
      </Section>

      <Section
        title="Others"
        collapsible
        isExpanded={expandedSections.others}
        onToggle={() => toggleSection('others')}
        active={destination.kind === 'section' && destination.id === 'others'}
        onClick={() => setDestination({ kind: 'section', id: 'others' })}
        hasGroups={otherTags.length > 0}
        emptyMessage="No tags yet"
      >
        {otherTags.length > 0 && (
          <Group>
            <TagList
              tags={otherTags}
              destination={destination}
              onSelectTag={selectTag}
            />
          </Group>
        )}
      </Section>
    </SidebarPanel>
  );
}
