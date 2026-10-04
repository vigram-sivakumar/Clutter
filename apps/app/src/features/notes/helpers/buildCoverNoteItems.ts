import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type {
  PickerListAncestor,
  PickerListItem,
} from '@components/picker-list/PickerList.types';
import { getFolderDisplayLabel } from '@core/presentation/getFolderDisplayLabel';
import { dailyNoteSearchText } from '@core/presentation/dailyNoteSearchText';
import { formatDailyNotePickerTitle } from '@core/presentation/formatDailyNoteTitle';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { isToday } from '@shared/helpers/time';

/**
 * The note list for "pick a note to give a cover to": one flat, selectable
 * row per page, alphabetical by its filename. A Daily Note reads as its date
 * title and Daily Note icon — exactly as its page does — and a note as its
 * name, its own emoji and the note icon. The caller decides which pages
 * qualify (`MembershipSelector.getAllVisiblePages`). Each row carries its folder
 * chain (root-first) as `ancestors`, so the picker can show where the note lives;
 * a note at the vault root, and a Daily Note (its date title is enough), have none.
 */
export function buildCoverNoteItems(
  pages: readonly Page[],
  getFolder: (id: string) => Folder | undefined
): PickerListItem[] {
  function ancestorsOf(page: Page): PickerListAncestor[] {
    const chain: PickerListAncestor[] = [];
    let current = page.parentId;
    while (current) {
      const folder = getFolder(current);
      if (!folder) {
        break;
      }
      chain.unshift({ id: folder.id, title: getFolderDisplayLabel(folder).text, emoji: folder.metadata.icon });
      current = folder.parentId;
    }
    return chain;
  }

  const byName = (a: Page, b: Page) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const isDailyNote = (page: Page) => page.type === 'daily-note';
  // Notes first, then Daily Notes, each alphabetical by filename — the picker draws a
  // titled section (with a divider between them) from `section`.
  const ordered = [
    ...pages.filter((page) => !isDailyNote(page)).sort(byName),
    ...pages.filter(isDailyNote).sort(byName),
  ];

  return ordered.map((page) => {
      const isDaily = page.type === 'daily-note';
      // A Daily Note's date title already says where it belongs — no path.
      const ancestors = isDaily ? [] : ancestorsOf(page);

      return {
        id: page.id,
        title: isDaily ? formatDailyNotePickerTitle(page.name) : page.name,
        // The row reads `24 Aug`; the note is also found by its date as written elsewhere.
        ...(isDaily && { searchText: dailyNoteSearchText(page.name) }),
        emoji: isDaily ? null : page.metadata.icon,
        icon: getPageIcon(page.type, isDaily && isToday(page.name)),
        level: 0,
        parentId: null,
        ancestors: ancestors.length > 0 ? ancestors : undefined,
        section: isDaily ? 'Daily notes' : 'Notes',
      };
  });
}
