import type { Folder } from '@core/vault/models';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import { getPageDisplayLabel } from '@core/presentation/getPageDisplayLabel';
import { getFolderDisplayLabel } from '@core/presentation/getFolderDisplayLabel';
import { NOTE_SORT_OPTIONS, sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import type { SidebarSort } from '@core/properties/sidebarSort';
import { toFolderValues, toNoteValues } from '@features/collection/page/toCollectionPageModel';

export type LevelKind = 'folder' | 'page' | 'resource';

/**
 * The order a level's three groups are drawn in. The root lists folders, notes, files; a nested
 * folder lists notes, files, subfolders. Kind is the one sort that rearranges the groups: 'down'
 * is folders → notes → files, 'up' the reverse. Every other sort keeps the arrangement and orders
 * within each group.
 */
export function levelKindOrder(isRoot: boolean, sort: SidebarSort | undefined): readonly LevelKind[] {
  if (!isRoot && sort?.key === 'kind') {
    return sort.direction === 'down' ? ['folder', 'page', 'resource'] : ['resource', 'page', 'folder'];
  }

  return isRoot ? ['folder', 'page', 'resource'] : ['page', 'resource', 'folder'];
}

/** The collection engine's sort for a key that orders within a group, or undefined (Kind, or no sort) to keep the order given. */
function withinGroupSort(sort: SidebarSort | undefined): CollectionSort | undefined {
  if (!sort || sort.key === 'kind') {
    return undefined;
  }

  return { property: sort.key, direction: sort.direction };
}

/**
 * A folder's children in the order the user chose for it — the collection views' own sort engine
 * (`sortEntries`) over the same property values (`toFolderValues`/`toNoteValues`), ordering by the
 * name each row displays. Folders and notes are ordered separately, as the collection page does;
 * files keep their order. Without a chosen sort (or with Kind) the input order stands.
 */
export function sortSidebarFolders(
  folders: readonly Folder[],
  sort: SidebarSort | undefined
): readonly Folder[] {
  const engineSort = withinGroupSort(sort);
  if (!engineSort) {
    return folders;
  }

  return sortEntries(
    folders.map((folder) => ({ folder, values: toFolderValues(getFolderDisplayLabel(folder).text, folder) })),
    engineSort,
    NOTE_SORT_OPTIONS
  ).map((entry) => entry.folder);
}

export function sortSidebarPages(
  pages: readonly EffectivePage[],
  sort: SidebarSort | undefined
): readonly EffectivePage[] {
  const engineSort = withinGroupSort(sort);
  if (!engineSort) {
    return pages;
  }

  return sortEntries(
    pages.map((page) => ({ page, values: toNoteValues(getPageDisplayLabel(page).text, page) })),
    engineSort,
    NOTE_SORT_OPTIONS
  ).map((entry) => entry.page);
}
