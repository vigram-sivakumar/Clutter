import type { Page } from '@core/vault/models/Page';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';

/**
 * The note list for "pick a note to give a cover to": one flat, selectable
 * row per page (title and its own emoji, no nesting), alphabetical. The caller
 * decides which pages qualify (`MembershipSelector.getAllVisiblePages`).
 */
export function buildCoverNoteItems(pages: readonly Page[]): FolderPickerItem[] {
  return [...pages]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((page) => ({
      id: page.id,
      title: page.name,
      emoji: page.metadata.icon,
      level: 0,
      parentId: null,
    }));
}
