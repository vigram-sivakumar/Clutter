import type { Page } from '@core/vault/models/Page';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { formatDailyNoteTitle } from '@core/presentation/formatDailyNoteTitle';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { isToday } from '@shared/helpers/time';

/**
 * The note list for "pick a note to give a cover to": one flat, selectable
 * row per page, alphabetical by its filename. A Daily Note reads as its date
 * title and Daily Note icon — exactly as its page does — and a note as its
 * name, its own emoji and the note icon. The caller decides which pages
 * qualify (`MembershipSelector.getAllVisiblePages`).
 */
export function buildCoverNoteItems(pages: readonly Page[]): FolderPickerItem[] {
  return [...pages]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((page) => {
      const isDaily = page.type === 'daily-note';

      return {
        id: page.id,
        title: isDaily ? formatDailyNoteTitle(page.name) : page.name,
        emoji: isDaily ? null : page.metadata.icon,
        icon: getPageIcon(page.type, isDaily && isToday(page.name)),
        level: 0,
        parentId: null,
      };
    });
}
