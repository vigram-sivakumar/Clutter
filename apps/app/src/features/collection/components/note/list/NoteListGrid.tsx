import type { HTMLAttributes, ReactNode } from 'react';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import './NoteListGrid.css';

export interface NoteListGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /**
   * Wires a trailing "New Note" row, the list-mode counterpart to
   * NoteTable's own always-rendered one — but unlike that one, this row
   * only renders at all when present (the caller, CollectionBody, only
   * passes it once there's at least one real note; list mode's own empty
   * state is not this row). Absent renders exactly the plain list every
   * existing caller already gets.
   */
  onCreateNote?: () => void;
}

export function NoteListGrid({
  children,
  onCreateNote,
  className,
  ...props
}: NoteListGridProps) {
  return (
    <div
      {...props}
      className={['note-list-grid', className].filter(Boolean).join(' ')}
    >
      {children}

      {onCreateNote && (
        <CollectionEntry
          className="note-list note-list-grid__new-note"
          icon="plus"
          title="New Note"
          onClick={onCreateNote}
        />
      )}
    </div>
  );
}
