import { resetThemePreference } from '@design-system/useTheme';
import { resetWeekStart } from '@features/daily-notes/calendar/weekStart';
import { resetHeaderSeparator } from '@app/layouts/page/headerSeparator';
import { clearLegacyAppSettings } from '@shared/helpers/legacyAppSettings';
import { DEFAULT_APPLY_TEMPLATE_COVER, writeApplyTemplateCover } from '@shared/helpers/applyTemplateCoverPreference';
import { DEFAULT_APPLY_TEMPLATE_ICON, writeApplyTemplateIcon } from '@shared/helpers/applyTemplateIconPreference';
import { DEFAULT_FOLDER_ITEM_LIMIT_CHOICE, writeFolderItemLimitChoice } from '@shared/helpers/folderItemLimitPreference';
import { DEFAULT_GROUP_TASKS_BY_DUE_DATE, writeGroupTasksByDueDate } from '@shared/helpers/groupTasksByDueDatePreference';
import { DEFAULT_SHOW_ASSETS_IN_FOLDERS, writeShowAssetsInFolders } from '@shared/helpers/showAssetsInFoldersPreference';
import { DEFAULT_SHOW_DAILY_NOTE_EMOJI, writeShowDailyNoteEmoji } from '@shared/helpers/showDailyNoteEmojiPreference';
import {
  DEFAULT_SHOW_REFERENCES_AUTOMATICALLY,
  writeShowReferencesAutomatically,
} from '@shared/helpers/showReferencesAutomaticallyPreference';
import { DEFAULT_MARKDOWN_ITALIC_FONT, writeMarkdownItalicFont } from '@shared/helpers/markdownItalicFontPreference';
import { DEFAULT_SHOW_TAG_EMOJIS, writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';
import { DEFAULT_TASK_ITEM_LIMIT_CHOICE, writeTaskItemLimitChoice } from '@shared/helpers/taskItemLimitPreference';
import { DEFAULT_DATE_FORMAT_CHOICE, writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { resetDefaultSidebarTab } from '../sidebar-setting/defaultSidebarTab';
import { resetStartupBehavior } from '../startup-setting/startupPreference';

/**
 * Every app-wide preference Settings offers, back to its default. These are the settings that live on this device
 * (`localStorage`) and apply to every Space; each one goes through its own module, so the saved value is removed (a
 * missing value IS the default) and whatever is showing it is told, with nothing here knowing a key or a storage
 * format. Space-specific settings are not here — they live in each Space and are reset by `resetSettingsToDefaults`.
 *
 * Deliberately NOT reset — they are interface layout or remembered picks, not settings: the sidebar width, a
 * collection's view, properties and sort (saved in each Space), and the last emoji skin tone, cover source and
 * gradient. `resetSettings.storageKeys.test.ts` fails if a storage key is added without being put on one side.
 *
 * Adding a setting means adding its reset here: a setting this does not reset survives "Reset settings to defaults".
 */
export function resetAppPreferences(): void {
  // Appearance
  resetThemePreference();
  // Startup
  resetStartupBehavior();
  resetDefaultSidebarTab();
  // Calendar and dates
  resetWeekStart();
  writeDateFormatChoice(DEFAULT_DATE_FORMAT_CHOICE);
  // Sidebar lists
  writeFolderItemLimitChoice(DEFAULT_FOLDER_ITEM_LIMIT_CHOICE);
  writeShowAssetsInFolders(DEFAULT_SHOW_ASSETS_IN_FOLDERS);
  writeTaskItemLimitChoice(DEFAULT_TASK_ITEM_LIMIT_CHOICE);
  writeGroupTasksByDueDate(DEFAULT_GROUP_TASKS_BY_DUE_DATE);
  writeShowTagEmojis(DEFAULT_SHOW_TAG_EMOJIS);
  writeShowDailyNoteEmoji(DEFAULT_SHOW_DAILY_NOTE_EMOJI);
  // Templates
  writeApplyTemplateIcon(DEFAULT_APPLY_TEMPLATE_ICON);
  writeApplyTemplateCover(DEFAULT_APPLY_TEMPLATE_COVER);
  // Notes
  writeShowReferencesAutomatically(DEFAULT_SHOW_REFERENCES_AUTOMATICALLY);
  resetHeaderSeparator();
  // Editor
  writeMarkdownItalicFont(DEFAULT_MARKDOWN_ITALIC_FONT);
  // The old app-wide values a Space with no setting of its own would be seeded from again.
  clearLegacyAppSettings();
}
