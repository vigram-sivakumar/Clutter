import type { Application } from '@core/application/Application';
import { clearPreferredTemplates } from '@core/application/templates/PreferredTemplatesStore';
import { clearSpaceProfileSettings } from '@core/application/space/SpaceProfileStore';
import type { VaultFileSystem } from '@core/vault/providers/VaultFileSystem';
import { resetAppPreferences } from './resetAppPreferences';

export interface ResetSettingsDeps {
  /** The open Space's Application: its settings reset through its own stores, so the UI and the file stay together. */
  readonly application: Application;
  /** The open Space's path, only to name it if it could not be reset. */
  readonly activePath: string;
  /** Every other registered Space, whose settings are reset directly in their files. */
  readonly inactiveSpacePaths: readonly string[];
  /** A file system rooted at a Space's folder, for a Space that is not open. */
  readonly fileSystemFor: (path: string) => VaultFileSystem;
}

export interface ResetSettingsOutcome {
  /** The Spaces whose settings could not be reset (the open one included); everything else was. Empty when all were. */
  readonly failedSpaces: readonly string[];
}

/**
 * "Reset settings to defaults": every setting Settings offers back to its default, in every Space.
 *
 *  - the open Space, through its Application (the one writer of its settings while it is open);
 *  - every other registered Space, in its own `.clutter/workspace.json` — only when there is a setting to take out;
 *  - the app-wide preferences on this device.
 *
 * Settings only. It never touches notes, templates, assets, tags or folders, a Space's identity, name or avatar, or any
 * view or layout customization — a collection's view, properties and sort, the sidebar's width and expansion, the open
 * page. A step that fails does not stop the others (each Space is its own file, and a missing or unreadable folder must
 * not keep the rest from resetting); the failures come back so the caller can say so, and running it again resets what
 * is left. The device-wide preferences go last and cannot fail in a way that matters: an unwritable store only means a
 * default does not outlive the session, as for every preference.
 */
export async function resetSettingsToDefaults(deps: ResetSettingsDeps): Promise<ResetSettingsOutcome> {
  const failedSpaces: string[] = [];

  try {
    await deps.application.resetSpaceSettings();
  } catch (error) {
    console.warn('Reset settings: could not reset the open Space.', error);
    failedSpaces.push(deps.activePath);
  }

  for (const path of deps.inactiveSpacePaths) {
    try {
      const fileSystem = deps.fileSystemFor(path);
      await clearSpaceProfileSettings(fileSystem, path);
      await clearPreferredTemplates(fileSystem, path);
    } catch (error) {
      console.warn(`Reset settings: could not reset the Space at ${path}.`, error);
      failedSpaces.push(path);
    }
  }

  resetAppPreferences();

  return { failedSpaces };
}
