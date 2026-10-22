import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import {
  getSystemLocationPresentation,
  type SystemLocationId,
} from '@core/presentation/systemPresentation';
import type { ReactNode } from 'react';
import { Pill } from '@components/property-list/Pill';
import { Entry } from '@components/entry/Entry';
import { AppIcon, type SystemIcon } from '@shared/icon';
import './SettingsSidebar.css';

export type FixedSettingsPageId = 'preferences' | 'notes' | 'daily-notes' | 'tasks' | 'tags' | 'assets' | 'layout';
/** A Space's own page, identified by its path. */
export type SpaceSettingsPageId = `space:${string}`;
export type SettingsPageId = FixedSettingsPageId | SpaceSettingsPageId;

export const spacePageId = (path: string): SpaceSettingsPageId => `space:${path}`;
export const isSpacePageId = (id: SettingsPageId): id is SpaceSettingsPageId => id.startsWith('space:');

export const DEFAULT_SETTINGS_PAGE: SettingsPageId = 'preferences';

interface SettingsSidebarEntry {
  id: FixedSettingsPageId;
  title: string;
  /** Takes the icon from the same source as the main sidebar's tabs. */
  location?: SystemLocationId;
  /** An icon of its own, for a page that isn't one of the main sidebar's locations. */
  icon?: SystemIcon;
}

const SECTIONS: { title: string; entries: SettingsSidebarEntry[] }[] = [
  {
    title: 'General',
    entries: [{ id: 'preferences', title: 'Preferences', icon: 'settings' }],
  },
  {
    title: 'Features',
    entries: [
      { id: 'notes', title: 'Notes', location: 'notes' },
      { id: 'daily-notes', title: 'Daily notes', location: 'daily-notes' },
      { id: 'tags', title: 'Tags', location: 'tags' },
      { id: 'assets', title: 'Assets', location: 'assets' },
      { id: 'tasks', title: 'Tasks', location: 'tasks' },
    ],
  },
  {
    title: 'Editor',
    entries: [{ id: 'layout', title: 'Layout', icon: 'layout' }],
  },
];

/** One Space in the sidebar's Spaces section. The avatar is drawn by whoever renders Settings, with the shared `SpaceAvatar`. */
export interface SettingsSpaceItem {
  readonly path: string;
  readonly name: string;
  /** Drawn by the caller with the shared SpaceAvatar. */
  readonly avatar: ReactNode;
  /** The avatar for this Space's own page, when it should differ from `avatar` (e.g. without the status badge). */
  readonly pageAvatar?: ReactNode;
  readonly active: boolean;
  /** The Space's folder is confirmed missing (the registry's own detection), so its page offers recovery. */
  readonly missing?: boolean;
  /** Whether the Space has an avatar of its own (an emoji or an image), so the picker can offer Remove. */
  readonly hasAvatar?: boolean;
}

export interface SettingsSpace {
  /** Every available Space, listed in a "Spaces" section above the pages; choosing one opens its page. */
  readonly spaces?: readonly SettingsSpaceItem[];
  /** Forgets a Space in Clutter (its folder is untouched). Absent: the Space page has no Remove space. */
  readonly onRemoveSpace?: (path: string) => void;
  /** Recovers a missing Space by choosing its new location (the Space-not-found dialog's "Change location"). Absent: no such button. */
  readonly onChangeMissingSpaceLocation?: (path: string) => void;
  /**
   * The Space is changing under the dialog (renamed, switched, recovered): its Application is closed or about to be,
   * so nothing Space-related can be changed or started from here until the next one is open. The dialog and its
   * navigation stay; the Space's own controls are disabled.
   */
  readonly busy?: boolean;
  /**
   * Renames the OPEN Space's folder (a Space's name is its folder's name). Resolves `{}` once it was accepted and
   * carried out — the Space is then reopened under its new name, so the page that asked is usually gone — or
   * `{ error }` with what to show when nothing was changed. Absent: the open Space's name is read-only.
   */
  readonly onRenameActiveSpace?: (newName: string) => Promise<{ error?: string }>;
  /**
   * Renames the folder of a Space that is NOT open, without touching the open one. Same result shape as above: `{}`
   * once carried out, or `{ error }` with what to show. Absent: another Space's name is read-only.
   */
  /**
   * Changes the OPEN Space's avatar (`undefined` removes it): an emoji, or an image given by the absolute path of the file
   * the user chose. Resolves `{}` once saved or `{ error }`. A Space's profile is only ever written while it is open, so
   * another Space's avatar can't be changed from here. Absent: the avatar is not clickable.
   */
  readonly onChangeActiveSpaceAvatar?: (
    avatar: { type: 'emoji'; emoji: string } | { type: 'image'; src: string } | undefined
  ) => Promise<{ error?: string }>;
  readonly onRenameInactiveSpace?: (path: string, newName: string) => Promise<{ error?: string }>;
}

interface SettingsSidebarProps {
  selectedId: SettingsPageId;
  onSelect: (id: SettingsPageId) => void;
  /** The Spaces listed above the pages. Absent: no Spaces section. */
  space?: SettingsSpace;
}

export function SettingsSidebar({
  selectedId,
  onSelect,
  space,
}: SettingsSidebarProps) {
  return (
    <div className="settings-sidebar">
      {space?.spaces && space.spaces.length > 0 && (
        <Section hasHeader title="Spaces">
          {space.spaces.map((item) => (
            <Entry
              key={item.path}
              leading={item.avatar}
              selected={selectedId === spacePageId(item.path)}
              trailing={item.active ? <Pill size="small">Current</Pill> : undefined}
              aria-current={item.active ? 'true' : undefined}
              title={item.path}
              onClick={() => onSelect(spacePageId(item.path))}
            >
              <span className="truncate">{item.name}</span>
            </Entry>
          ))}
        </Section>
      )}
      {SECTIONS.map((section) => (
        <Section key={section.title} hasHeader title={section.title}>
          {section.entries.map((entry) => (
            <Navigation
              key={entry.id}
              selected={entry.id === selectedId}
              title={entry.title}
              leading={
                entry.icon ? (
                  <AppIcon icon={entry.icon} />
                ) : (
                  entry.location && (
                    <AppIcon
                      icon={getSystemLocationPresentation(entry.location).icon}
                    />
                  )
                )
              }
              onClick={() => onSelect(entry.id)}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}
