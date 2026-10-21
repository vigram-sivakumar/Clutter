import { useState } from 'react';
import { useSharedSettingsDialogState } from './SettingsDialogState';
import './Settings.css';
import {
  DEFAULT_SETTINGS_PAGE,
  SettingsSidebar,
  isSpacePageId,
  spacePageId,
  type FixedSettingsPageId,
  type SettingsPageId,
  type SettingsSpace,
} from './settings-sidebar/SettingsSidebar';
import { RoundIconButton } from '@components/button/RoundIconButton';
import { SpacePage } from './space-page/SpacePage';
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
import type { SpaceSettingsSource } from './space-settings/SpaceSettingsSource';
import { isAllowMovingAssetsSettingEnabled } from '@core/featureFlags';
import { AllowMovingAssetsSetting } from './allow-moving-assets-setting/AllowMovingAssetsSetting';
import { AutoDeleteUnusedTagsSetting } from './auto-delete-unused-tags-setting/AutoDeleteUnusedTagsSetting';
import { AutoDeleteArchivedSetting } from './auto-delete-archived-setting/AutoDeleteArchivedSetting';
import { ShowAssetsInFoldersSetting } from './assets-setting/ShowAssetsInFoldersSetting';
import { CoverPositionSetting } from './cover-position-setting/CoverPositionSetting';
import { FolderItemsSetting } from './folder-items-setting/FolderItemsSetting';
import { SidebarSetting } from './sidebar-setting/SidebarSetting';
import { StartupSetting } from './startup-setting/StartupSetting';
import { DateFormatSetting } from './date-format-setting/DateFormatSetting';
import { WeekStartSetting } from './week-start-setting/WeekStartSetting';
import { ThemeSetting } from './theme-setting/ThemeSetting';
import { ShowDailyNoteEmojiSetting } from './daily-notes-setting/ShowDailyNoteEmojiSetting';
import { ShowReferencesAutomaticallySetting } from './references-setting/ShowReferencesAutomaticallySetting';
import { HeaderSeparatorSetting } from './header-separator-setting/HeaderSeparatorSetting';
import { HeaderSeparatorStyleSetting } from './header-separator-style-setting/HeaderSeparatorStyleSetting';

const PAGE_TITLES: Record<FixedSettingsPageId, string> = {
  preferences: 'Preferences',
  notes: 'Notes',
  'daily-notes': 'Daily notes',
  tags: 'Tags',
  assets: 'Assets',
  layout: 'Layout',
};

interface SettingsProps {
  /** The open Space's templates, for the pickers on the settings pages. */
  templates?: TemplatesSource;
  /** The open Space's folders and default note location, for the Default note location setting. */
  noteLocation?: NoteLocationSource;
  /** The open Space's own settings (cover position, automatic archive cleanup): saved in the Space, so each Space has its own. */
  spaceSettings?: SpaceSettingsSource;
  /** The open Space's avatar and name for the sidebar header. */
  space?: SettingsSpace;
  /** Closes the dialog the settings are shown in, for a setting that navigates away (e.g. opening a template). */
  onClose?: () => void;
}

export function Settings({ templates, noteLocation, spaceSettings, space, onClose }: SettingsProps = {}) {
  const shared = useSharedSettingsDialogState();
  const [localPageId, setLocalPageId] = useState<SettingsPageId>(DEFAULT_SETTINGS_PAGE);
  const pageId = shared?.pageId ?? localPageId;
  const setPageId = shared?.setPageId ?? setLocalPageId;

  const selectedSpace = isSpacePageId(pageId)
    ? space?.spaces?.find((item) => spacePageId(item.path) === pageId)
    : undefined;

  return (
    <div className="settings">
      <SettingsSidebar selectedId={pageId} onSelect={setPageId} space={space} />
      <SettingsPage key={pageId} title={isSpacePageId(pageId) ? 'Space setting' : PAGE_TITLES[pageId]}>
        {isSpacePageId(pageId) && selectedSpace && (
          <SpacePage
            key={selectedSpace.path}
            name={selectedSpace.name}
            path={selectedSpace.path}
            // Every Space can be renamed from here: the open one through its Application, another one directly.
            onRename={
              selectedSpace.active
                ? space?.onRenameActiveSpace
                : space?.onRenameInactiveSpace && ((newName) => space.onRenameInactiveSpace!(selectedSpace.path, newName))
            }
            busy={space?.busy}
            avatar={selectedSpace.pageAvatar ?? selectedSpace.avatar}
            hasAvatar={selectedSpace.hasAvatar}
            missing={selectedSpace.missing}
            onChangeLocation={
              selectedSpace.missing && space?.onChangeMissingSpaceLocation
                ? () => space.onChangeMissingSpaceLocation!(selectedSpace.path)
                : undefined
            }
            onChangeAvatar={selectedSpace.active ? space?.onChangeActiveSpaceAvatar : undefined}
            onRemove={
              space?.onRemoveSpace &&
              (() => {
                // The page being removed goes away with it.
                setPageId(DEFAULT_SETTINGS_PAGE);
                space.onRemoveSpace?.(selectedSpace.path);
              })
            }
          />
        )}
        {pageId === 'preferences' && (
          <>
            <SettingsGroup title="Appearance">
              <ThemeSetting />
              <CoverPositionSetting source={spaceSettings} />
            </SettingsGroup>
            <SettingsGroup title="Startup">
              <StartupSetting />
              <SidebarSetting />
            </SettingsGroup>
            <SettingsGroup title="Calendar">
              <WeekStartSetting />
              <DateFormatSetting />
            </SettingsGroup>
            <SettingsGroup title="Data & storage">
              <AutoDeleteArchivedSetting source={spaceSettings} />
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
        {pageId === 'tags' && (
          <SettingsGroup>
            <AutoDeleteUnusedTagsSetting source={spaceSettings} />
          </SettingsGroup>
        )}
        {pageId === 'assets' && (
          <SettingsGroup>
            <ShowAssetsInFoldersSetting />
            {/* Hidden for now (core/featureFlags.ts): the setting only, not what it controls. */}
            {isAllowMovingAssetsSettingEnabled() && <AllowMovingAssetsSetting source={spaceSettings} />}
          </SettingsGroup>
        )}
        {pageId === 'layout' && (
          <>
            <SettingsGroup>
              <HeaderSeparatorSetting />
              <HeaderSeparatorStyleSetting />
            </SettingsGroup>
            <SettingsGroup>
              <ShowReferencesAutomaticallySetting />
            </SettingsGroup>
          </>
        )}
        {pageId === 'daily-notes' && (
          <>
            <SettingsGroup title="Sidebar appearance">
              <ShowDailyNoteEmojiSetting />
            </SettingsGroup>
            <PreferredTemplates
              context="dailyNotes"
              templates={templates}
              onCloseSettings={onClose}
            />
          </>
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
