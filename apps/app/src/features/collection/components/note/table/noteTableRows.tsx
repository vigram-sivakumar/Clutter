import type { ReactNode } from 'react';

import { CollectionEntry } from '@features/collection/CollectionEntry';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import type {
  CollectionDataTableRow,
  CollectionTableCellValue,
} from '../../table/CollectionDataTable';
import type { NoteTableColumnVisibility } from './noteTableColumns';

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
  /** Hover-revealed trailing slot for the row (Archive's Restore / Delete). */
  readonly actions?: ReactNode;
}

/**
 * A note as a row of the generic collection table: its values only, keyed by
 * the column ids `buildNoteTableColumns` declares. The note-specific part is
 * just this mapping (which field fills which column); drawing the cells and
 * the grid is `CollectionDataTable`'s job.
 */
export function toNoteTableRow(
  entry: CollectionEntryModel,
  { showDescription, columns, actions }: NoteTableRowOptions
): CollectionDataTableRow {
  const cells: Record<string, CollectionTableCellValue> = {
    name: {
      kind: 'header',
      icon: 'note',
      emoji: entry.emoji ?? undefined,
      title: entry.title,
      description: showDescription ? entry.description : undefined,
      descriptionPlaceholder: showDescription ? 'No description' : undefined,
      isSelected: entry.selected,
    },
  };

  // `lastOpened` has no data source (see CollectionEntryModel) — its cell is
  // present but empty, as before.
  if (columns.lastOpened) {
    cells.lastOpened = { kind: 'date' };
  }
  if (columns.created) {
    cells.created = { kind: 'date', value: entry.created, dateTime: entry.createdAt };
  }
  if (columns.updated) {
    cells.updated = { kind: 'date', value: entry.updated, dateTime: entry.updatedAt };
  }
  if (columns.archived) {
    cells.archived = { kind: 'date', value: entry.archived, dateTime: entry.archivedAt };
  }

  return { id: entry.id, cells, onClick: entry.onClick, actions };
}

/** The notes table's trailing "New Note" row — passed as the table's `footer`. */
export function NoteTableNewRow({ onClick }: { readonly onClick?: () => void }) {
  return (
    <CollectionEntry
      className="collection-table__new-item"
      icon="plus"
      title="New Note"
      onClick={onClick}
    />
  );
}
