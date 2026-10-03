import { collectionFieldLabel } from '@features/collection/collectionFieldLabels';
import type { CollectionTableColumn } from '../../table/collectionTableColumns';

/**
 * Which of the notes table's optional columns (beyond the always-present Name
 * column) are currently visible. `buildNoteTableColumns` turns it into the
 * columns `CollectionDataTable` draws — the one source of the header and of
 * every row's grid and cells, so a hidden column is gone from all of them at
 * once and the rest reflow into its space.
 */
export interface NoteTableColumnVisibility {
  /** The Cover image column — a media cell showing the note's cover; hidden unless the host can change covers. */
  cover?: boolean;
  lastOpened: boolean;
  created: boolean;
  updated: boolean;
  /** The Archive collection's own column — absent (hidden) everywhere else. */
  archived?: boolean;
}

export const DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY: NoteTableColumnVisibility = {
  lastOpened: true,
  created: true,
  updated: true,
};

/** The date columns, in display order — each is a 140px track holding a date cell. */
const DATE_COLUMNS = [
  { id: 'lastOpened', className: 'last-opened' },
  { id: 'created', className: 'created' },
  { id: 'updated', className: 'updated' },
  { id: 'archived', className: 'archived' },
] as const;

/**
 * The notes table's columns for a given visibility — Name always
 * (`minmax(400px, 1fr)`), then the Cover image column if on (`110px`), then
 * each date column that is on (`140px` each; a hidden column reserves no
 * grid space at all).
 */
export function buildNoteTableColumns(
  visibility: NoteTableColumnVisibility
): CollectionTableColumn[] {
  const columns: CollectionTableColumn[] = [
    {
      id: 'name',
      label: 'Name',
      width: 'minmax(400px, 1fr)',
      className: 'collection-table__header-cell--name',
    },
  ];

  if (visibility.cover) {
    columns.push({
      id: 'cover',
      label: 'Cover image',
      width: '110px',
      className: 'collection-table__header-cell--cover',
      cellClassName: 'collection-table-row__cover',
    });
  }

  for (const { id, className } of DATE_COLUMNS) {
    if (visibility[id]) {
      columns.push({
        id,
        label: collectionFieldLabel(id),
        width: '140px',
        className: `collection-table__header-cell--${className}`,
        cellClassName: `collection-table-row__${className}`,
      });
    }
  }

  return columns;
}
