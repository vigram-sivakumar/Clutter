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
}

export const DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY: NoteTableColumnVisibility = {
  lastOpened: true,
  created: true,
  updated: true,
};

/**
 * The Name column is always present (`minmax(500px, 1fr)`, matching
 * `--collection-table-column`'s original first track); each optional
 * column contributes its `140px` track only when visible, so a hidden
 * column reserves no grid space at all — the remaining columns reflow
 * into the space it would have used.
 */
export function buildNoteTableGridTemplateColumns(
  visibility: NoteTableColumnVisibility
): string {
  const columns = ['minmax(500px, 1fr)'];

  if (visibility.lastOpened) {
    columns.push('140px');
  }
  if (visibility.created) {
    columns.push('140px');
  }
  if (visibility.updated) {
    columns.push('140px');
  }

  return columns.join(' ');
}
