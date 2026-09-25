import type { HTMLAttributes, ReactNode } from 'react';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import './NoteTable.css';
import {
  buildNoteTableGridTemplateColumns,
  DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,
  type NoteTableColumnVisibility,
} from './noteTableColumns';

export interface NoteTableProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Defaults to all three optional columns visible — the original, unconditional-header behavior. See noteTableColumns.ts's own doc comment. */
  columns?: NoteTableColumnVisibility;
  /**
   * Wires the always-rendered trailing "New Note" row's click. Absent
   * (the default) keeps that row exactly as it's always been — present
   * but inert (no onClick, so CollectionEntry never gives it `role`/
   * `tabIndex` either) — e.g. ArchiveCollectionBody's own NoteTable,
   * which has no "create a note here" concept and so never passes this.
   */
  onCreateNote?: () => void;
}

export function NoteTable({
  children,
  className,
  columns = DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,
  onCreateNote,
  ...props
}: NoteTableProps) {
  const gridTemplateColumns = buildNoteTableGridTemplateColumns(columns);

  return (
    <div
      {...props}
      className={['note-table', className].filter(Boolean).join(' ')}
    >
      <div className="note-table__header" style={{ gridTemplateColumns }}>
        <div className="note-table__header-cell note-table__header-cell--name">
          Name
        </div>

        {columns.lastOpened && (
          <div className="note-table__header-cell note-table__header-cell--last-opened">
            Last opened
          </div>
        )}

        {columns.created && (
          <div className="note-table__header-cell note-table__header-cell--created">
            Date created
          </div>
        )}

        {columns.updated && (
          <div className="note-table__header-cell note-table__header-cell--updated">
            Date updated
          </div>
        )}
      </div>

      <div className="note-table__body">
        {children}{' '}
        <CollectionEntry
          className="note-table__new-note"
          icon="plus"
          title="New Note"
          onClick={onCreateNote}
        />
      </div>
    </div>
  );
}
