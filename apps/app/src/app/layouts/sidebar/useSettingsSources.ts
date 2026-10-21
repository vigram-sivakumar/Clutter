import { useMemo } from 'react';
import type { Application } from '@core/application/Application';
import { buildNoteLocationFolders } from '@features/notes/helpers/buildNoteLocationFolders';
import type { SpaceSettingsSource } from '@features/settings/space-settings/SpaceSettingsSource';
import type { NoteLocationSource } from '@features/settings/default-note-location-setting/DefaultNoteLocationSetting';
import type { TemplatesSource } from '@features/settings/preferred-templates/PreferredTemplates';
import { createTemplate } from '@features/notes/helpers/createTemplate';
import type { PreferredTemplatesContext } from '@core/application/templates/PreferredTemplatesStore';
import { sortTemplatesByRecentUse } from '@features/notes/helpers/templateSuggestions';
import { toTemplateEntries } from '@features/collection/page/toCollectionPageModel';

export interface SettingsSources {
  templates: TemplatesSource;
  noteLocation: NoteLocationSource;
  spaceSettings: SpaceSettingsSource;
}

function buildSettingsSources(application: Application): SettingsSources {
  const { vault, membershipSelector, folderOperations, pageOperations } = application;

  // The open Space's templates for the pickers in Settings: the same templates, in the same order, as From
  // template and the note's template suggestions, plus the user's preferred-template list.
  const settingsTemplates: TemplatesSource = {
      getTemplates: () =>
        sortTemplatesByRecentUse(
          toTemplateEntries(vault, membershipSelector, () => undefined),
          (templateId) => application.templateUsageStore.lastUsedAt(templateId)
        ),
      onCreateTemplate: () =>
        void createTemplate(folderOperations, pageOperations).catch(() => {}),
      // A template is a note: the same open the sidebar's own rows use.
      onOpenTemplate: (templateId: string) => void pageOperations.open(templateId),
      preferred: {
        getIds: (context: PreferredTemplatesContext) =>
          application.preferredTemplatesStore.getIds(context),
        add: (templateId: string, context: PreferredTemplatesContext) =>
          application.preferredTemplatesStore.add(templateId, context),
        remove: (templateId: string, context: PreferredTemplatesContext) =>
          application.preferredTemplatesStore.remove(templateId, context),
        subscribe: (listener: () => void) => application.preferredTemplatesStore.subscribe(listener),
        getDefaultDailyNoteId: () => application.preferredTemplatesStore.getDefaultDailyNoteTemplateId(),
        setDefaultDailyNote: (templateId: string | undefined) =>
          application.preferredTemplatesStore.setDefaultDailyNoteTemplate(templateId),
      },
  };
  // The Default note location setting's folders: the same list a Move picker offers for a note (every folder
  // the sidebar's tree can show, nested ones with their parents), without Inbox (the default, listed first by
  // the setting itself) and without Templates (a note created there is a template, a different thing).
  const settingsNoteLocation: NoteLocationSource = {
      getFolders: () => buildNoteLocationFolders(membershipSelector),
      // A read, never a write: it runs while the setting renders. A saved folder that is no longer a valid
      // destination reads as Inbox here, and the Application puts the saved value back to Inbox on the vault change.
      getSelectedId: () => {
        const saved = application.spaceProfile?.defaultNoteFolderId;
        return saved !== undefined && membershipSelector.isNoteDestinationFolder(saved) ? saved : undefined;
      },
      select: (folderId) => void application.spaceProfileStore.setDefaultNoteFolder(folderId),
      subscribe: (listener) => {
        const unsubscribeProfile = application.spaceProfileStore.subscribe(listener);
        const unsubscribeVault = vault.subscribe(() => listener());
        return () => {
          unsubscribeProfile();
          unsubscribeVault();
        };
      },
  };
  // The Space's own settings (cover position, automatic archive cleanup), read from and written to the open
  // Space's profile — so switching Space (a new Application) shows that Space's values.
  const settingsSpace: SpaceSettingsSource = {
      getCoverPosition: () => application.defaultCoverPosition,
      setCoverPosition: (position) => void application.spaceProfileStore.setDefaultCoverPosition(position),
      getAutoDeleteArchived: () => application.autoDeleteArchived,
      setAutoDeleteArchived: (enabled) => void application.spaceProfileStore.setAutoDeleteArchived(enabled),
      subscribe: (listener: () => void) => application.spaceProfileStore.subscribe(listener),
  };
  return { templates: settingsTemplates, noteLocation: settingsNoteLocation, spaceSettings: settingsSpace };
}

/**
 * What the Settings dialog needs from the open Space, rebuilt when the Space (the Application) changes. With no
 * Application — the old one is closed and the next is not open yet — there is nothing to read, and nothing is
 * returned: the dialog must never reach into a closed Application.
 */
export function useSettingsSources(application: Application | null): SettingsSources | undefined {
  return useMemo(() => (application ? buildSettingsSources(application) : undefined), [application]);
}
