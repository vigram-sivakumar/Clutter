import { useState } from 'react';
import './Settings.css';
import {
  DEFAULT_SETTINGS_PAGE,
  SettingsSidebar,
  type SettingsPageId,
} from './settings-sidebar/SettingsSidebar';
import { RoundIconButton } from '@components/button/RoundIconButton';
import { SettingsPage } from './settings-page/SettingsPage';
import {
  PreferredTemplates,
  type TemplatesSource,
} from './preferred-templates/PreferredTemplates';
import { SettingsGroup } from './settings-group/SettingsGroup';
import {
  DefaultNoteLocationSetting,
  type NoteLocationSource,
} from './default-note-location-setting/DefaultNoteLocationSetting';
import { FolderItemsSetting } from './folder-items-setting/FolderItemsSetting';
import { SidebarSetting } from './sidebar-setting/SidebarSetting';
import { StartupSetting } from './startup-setting/StartupSetting';
import { DateFormatSetting } from './date-format-setting/DateFormatSetting';
import { WeekStartSetting } from './week-start-setting/WeekStartSetting';
import { ThemeSetting } from './theme-setting/ThemeSetting';

const PAGE_TITLES: Record<SettingsPageId, string> = {
  preferences: 'Preferences',
  notes: 'Notes',
  'daily-notes': 'Daily notes',
};

interface SettingsProps {
  /** The open Space's templates, for the pickers on the settings pages. */
  templates?: TemplatesSource;
  /** The open Space's folders and default note location, for the Default note location setting. */
  noteLocation?: NoteLocationSource;
  /** Closes the dialog the settings are shown in, for a setting that navigates away (e.g. opening a template). */
  onClose?: () => void;
}

export function Settings({ templates, noteLocation, onClose }: SettingsProps = {}) {
  const [pageId, setPageId] = useState<SettingsPageId>(DEFAULT_SETTINGS_PAGE);

  return (
    <div className="settings">
      <SettingsSidebar selectedId={pageId} onSelect={setPageId} />
      <SettingsPage key={pageId} title={PAGE_TITLES[pageId]}>
        {pageId === 'preferences' && (
          <>
            <SettingsGroup title="Appearance">
              <ThemeSetting />
            </SettingsGroup>
            <SettingsGroup title="Startup">
              <StartupSetting />
              <SidebarSetting />
            </SettingsGroup>
            <SettingsGroup title="Calendar">
              <WeekStartSetting />
              <DateFormatSetting />
            </SettingsGroup>
          </>
        )}
        {pageId === 'notes' && (
          <>
            <SettingsGroup title="Sidebar">
              <DefaultNoteLocationSetting source={noteLocation} />
              <FolderItemsSetting />
            </SettingsGroup>
            <PreferredTemplates
              context="notes"
              templates={templates}
              onCloseSettings={onClose}
            />
          </>
        )}
        {pageId === 'daily-notes' && (
          <PreferredTemplates
            context="dailyNotes"
            templates={templates}
            onCloseSettings={onClose}
          />
        )}
      </SettingsPage>
      {onClose && (
        <RoundIconButton
          className="settings__close"
          icon="dismiss"
          aria-label="Close settings"
          onClick={onClose}
        />
      )}
    </div>
  );
}
