import { collectionFieldLabel } from '@features/collection/collectionFieldLabels';
import {
  buildCollectionTableGridTemplateColumns,
  type CollectionTableColumn,
} from '../../table/collectionTableColumns';

/**
 * Which of NoteTable's optional columns (beyond the always-present Name
 * column) are currently visible. The single source `NoteTable`'s header
 * and `NoteTableRow`'s own grid both build their `grid-template-columns`
 * from, so the two can never drift out of alignment with each other —
 * neither component computes this independently.
 */
export interface NoteTableColumnVisibility {
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

/**
 * The Name column is always present (`minmax(400px, 1fr)`); each optional
 * column contributes its `140px` track only when visible, so a hidden
 * column reserves no grid space at all — the remaining columns reflow
 * into the space it would have used.
 */
/**
 * The notes table's columns for a given visibility — Name always, then each
 * date column that is on. The single source of both the header (CollectionTable)
 * and every row's grid (`buildNoteTableGridTemplateColumns`), so they can't
 * drift apart.
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

  if (visibility.lastOpened) {
    columns.push({
      id: 'lastOpened',
      label: collectionFieldLabel('lastOpened'),
      width: '140px',
      className: 'collection-table__header-cell--last-opened',
    });
  }
  if (visibility.created) {
    columns.push({
      id: 'created',
      label: collectionFieldLabel('created'),
      width: '140px',
      className: 'collection-table__header-cell--created',
    });
  }
  if (visibility.updated) {
    columns.push({
      id: 'updated',
      label: collectionFieldLabel('updated'),
      width: '140px',
      className: 'collection-table__header-cell--updated',
    });
  }
  if (visibility.archived) {
    columns.push({
      id: 'archived',
      label: collectionFieldLabel('archived'),
      width: '140px',
      className: 'collection-table__header-cell--archived',
    });
  }

  return columns;
}

export function buildNoteTableGridTemplateColumns(
  visibility: NoteTableColumnVisibility
): string {
  return buildCollectionTableGridTemplateColumns(buildNoteTableColumns(visibility));
}
