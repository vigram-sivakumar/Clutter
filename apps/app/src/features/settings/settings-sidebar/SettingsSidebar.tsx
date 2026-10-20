import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import {
  getSystemLocationPresentation,
  type SystemLocationId,
} from '@core/presentation/systemPresentation';
import { AppIcon, type SystemIcon } from '@shared/icon';
import './SettingsSidebar.css';

export type SettingsPageId = 'preferences' | 'notes' | 'daily-notes';

export const DEFAULT_SETTINGS_PAGE: SettingsPageId = 'preferences';

interface SettingsSidebarEntry {
  id: SettingsPageId;
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
    ],
  },
];

interface SettingsSidebarProps {
  selectedId: SettingsPageId;
  onSelect: (id: SettingsPageId) => void;
}

export function SettingsSidebar({
  selectedId,
  onSelect,
}: SettingsSidebarProps) {
  return (
    <div className="settings-sidebar">
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
