import type { HTMLAttributes, ReactNode } from 'react';

import { CollectionCardGrid } from '../../card/CollectionCardGrid';
import { NoteCard } from './NoteCard';
import './NoteCardGrid.css';

export interface NoteCardGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Trailing "New Note" card — same "present only once there's at least one note" convention as the notes list's "New Note" row. */
  onCreateNote?: () => void;
  /**
   * How many metadata lines (description, edited date) the collection's
   * Properties turn on. Header-only cards reserve exactly that many lines, so
   * their heights match whichever notes happen to have a description.
   */
  headerLines?: number;
}

/** The Notes Card view's container: the shared CollectionCardGrid plus what only note cards need (NoteCardGrid.css: canvas width, cover height, the New Note card). */
export function NoteCardGrid({
  children,
  onCreateNote,
  headerLines = 0,
  className,
  style,
  ...props
}: NoteCardGridProps) {
  return (
    <CollectionCardGrid
      {...props}
      className={['note-card-grid', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--note-card-header-lines' as string]: headerLines }}
    >
      {children}

      {onCreateNote && (
        // A card like the rest — same shell and size, but no body: just the
        // centered "+ New Note" action (NoteCard.css).
        <NoteCard
          className="note-card--new"
          icon="plus"
          title="New Note"
          showCover={false}
          showContent={false}
          onClick={onCreateNote}
        />
      )}
    </CollectionCardGrid>
  );
}
