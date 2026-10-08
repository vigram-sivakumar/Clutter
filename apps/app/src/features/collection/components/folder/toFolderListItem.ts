import type { CollectionDataListItem } from '@features/collection/components/list/CollectionDataList';
import type { CollectionDataTableRow } from '@features/collection/components/table/CollectionDataTable';
import type { PropertyId } from '@core/properties/collectionProperties';

import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import { formatPropertyValue, valueProperties } from '../../properties/formatProperty';
import { propertyValueCells } from '../../properties/tableColumns';

/**
 * A folder's contents as one line — "0 subfolders · 2 notes" — from the counts its adapter
 * carries. It is folder-specific presentation, NOT the Description property: a folder's own
 * description is a different thing and nothing in a collection shows it. `undefined` for a folder
 * entry that carries no counts (a Daily Notes year shows just its name).
 */
export function folderSummary(entry: CollectionEntryModel): string | undefined {
  if (entry.subfolderCount === undefined && entry.noteCount === undefined) {
    return undefined;
  }

  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  return `${plural(entry.subfolderCount ?? 0, 'subfolder', 'subfolders')} · ${plural(entry.noteCount ?? 0, 'note', 'notes')}`;
}

export interface FolderRowOptions {
  /** The visible properties (from the resolved view). A folder has only the values its adapter fills (its name, and an archive date in the Archive). */
  readonly visible: readonly PropertyId[];
}

/**
 * A folder as an item of the generic collection list: the folder icon (or its emoji), its name, and —
 * in the entry's trailing run, first — the contents summary, then the visible plain-value properties it
 * has a value for. A folder has no description in a list (its own description is a different thing and
 * nothing in a collection shows it), so the entry's description slot stays empty. Drawing the row is
 * `CollectionDataList`'s job — a folder has no list component of its own.
 */
export function toFolderListItem(entry: CollectionEntryModel, { visible }: FolderRowOptions): CollectionDataListItem {
  const summary = folderSummary(entry);

  return {
    id: entry.id,
    icon: 'folder',
    emoji: entry.emoji ?? undefined,
    title: entry.values.name,
    metadata: [
      ...(summary ? [summary] : []),
      ...valueProperties(visible)
        .map((id) => formatPropertyValue(id, entry.values))
        .filter((value): value is string => Boolean(value)),
    ],
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}

/** A folder as a row of the generic collection table: the same name cell and summary, then its property values. */
export function toFolderTableRow(entry: CollectionEntryModel, { visible }: FolderRowOptions): CollectionDataTableRow {
  return {
    id: entry.id,
    cells: {
      name: {
        variant: 'header',
        icon: 'folder',
        emoji: entry.emoji ?? undefined,
        title: entry.values.name,
        description: folderSummary(entry),
      },
      ...propertyValueCells(visible, entry.values),
    },
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}
