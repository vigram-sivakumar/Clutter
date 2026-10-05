import type { MouseEvent } from 'react';

import type {
  CollectionDataTableRow,
  CollectionTableCellValue,
} from '@features/collection/components/table/CollectionDataTable';

import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import type { NoteTableColumnVisibility } from './noteTableColumns';
import { toNoteCoverImage } from './toNoteCoverImage';

export interface NoteTableRowOptions {
  /**
   * Whether the description line (including its "No description" fallback)
   * is shown at all. A genuinely empty description still falls back to the
   * placeholder when this is `true` — that is a different case from "hidden
   * by preference", and this flag is what tells them apart.
   */
  readonly showDescription: boolean;
  /** Which date columns exist — must be the same visibility the table's columns were built from. */
  readonly columns: NoteTableColumnVisibility;
  /**
   * The Cover image column's cell for this note — only read when
   * `columns.cover` is on. `url` is the cover resolved to a loadable URL
   * (null: no visible cover); `onClick` is what the thumbnail does when
   * clicked (open the cover picker for this note).
   */
  readonly cover?: {
    readonly url: string | null;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
}

/**
 * A note as a row of the generic collection table: its values only, keyed by
 * the column ids `buildNoteTableColumns` declares. The note-specific part is
 * just this mapping (which field fills which column); drawing the cells and
 * the grid is `CollectionDataTable`'s job.
 */
export function toNoteTableRow(
  entry: CollectionEntryModel,
  { showDescription, columns, cover }: NoteTableRowOptions
): CollectionDataTableRow {
  const cells: Record<string, CollectionTableCellValue> = {
    name: {
      variant: 'header',
      icon: 'note',
      emoji: entry.emoji ?? undefined,
      title: entry.title,
      description: showDescription ? entry.description : undefined,
      descriptionPlaceholder: showDescription ? 'No description' : undefined,
    },
  };

  if (columns.cover && cover) {
    cells.cover = {
      variant: 'media',
      children: toNoteCoverImage(cover.url, entry.coverPositionAbove),
      onClick: cover.onClick,
      label: cover.url ? 'Change cover image' : 'Add cover image',
    };
  }

  if (columns.created) {
    cells.created = { variant: 'text', value: entry.created, dateTime: entry.createdAt };
  }
  if (columns.updated) {
    cells.updated = { variant: 'text', value: entry.updated, dateTime: entry.updatedAt };
  }
  if (columns.archived) {
    cells.archived = { variant: 'text', value: entry.archived, dateTime: entry.archivedAt };
  }

  return { id: entry.id, cells, isSelected: entry.selected, onClick: entry.onClick };
}
