import type { HTMLAttributes, ReactNode } from 'react';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import { CollectionTable } from '../../table/CollectionTable';
import {
  buildNoteTableColumns,
  DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,
  type NoteTableColumnVisibility,
} from './noteTableColumns';

export interface NoteTableProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  columns?: NoteTableColumnVisibility;
  /** Wires the trailing "New Note" row — always rendered in table mode, whatever the note count. */
  onCreateNote?: () => void;
}

/**
 * The notes table: the shared CollectionTable with the notes' columns (Name +
 * the visible date columns) and a trailing "New Note" row. Everything about
 * how a table looks and scrolls lives in CollectionTable.
 */
export function NoteTable({
  children,
  columns = DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,
  onCreateNote,
  ...props
}: NoteTableProps) {
  return (
    <CollectionTable
      {...props}
      columns={buildNoteTableColumns(columns)}
      footer={
        <CollectionEntry
          className="collection-table__new-item"
          icon="plus"
          title="New Note"
          onClick={onCreateNote}
        />
      }
    >
      {children}
    </CollectionTable>
  );
}
