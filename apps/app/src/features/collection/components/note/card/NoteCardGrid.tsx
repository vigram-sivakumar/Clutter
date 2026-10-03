import type { HTMLAttributes, ReactNode } from 'react';

import { NoteCard } from './NoteCard';
import './NoteCardGrid.css';

export interface NoteCardGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Trailing "New Note" card — same "present only once there's at least one note" convention as NoteListGrid's. */
  onCreateNote?: () => void;
  /**
   * The Cover image / Content preview properties, passed to the New Note
   * card too so it takes the same layout (both off: header-only; content off:
   * header plus an empty cover slot) and stays the same height as its
   * neighbours.
   */
  coverVisible?: boolean;
  contentVisible?: boolean;
  /**
   * How many metadata lines (description, edited date) the collection's
   * Properties turn on. Header-only cards reserve exactly that many lines, so
   * their heights match whichever notes happen to have a description.
   */
  headerLines?: number;
}

/** The Card view's container — owns the card dimensions every NoteCard inherits (NoteCardGrid.css). */
export function NoteCardGrid({
  children,
  onCreateNote,
  coverVisible = true,
  contentVisible = true,
  headerLines = 0,
  className,
  style,
  ...props
}: NoteCardGridProps) {
  return (
    <div
      {...props}
      className={['note-card-grid', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--note-card-header-lines' as string]: headerLines }}
    >
      {children}

      {onCreateNote && (
        // A card like the rest — same shell and size, a blank page instead
        // of a preview (no markdown, no cover, nothing to render).
        <NoteCard
          className="note-card--new"
          icon="plus"
          title="New Note"
          markdown=""
          showCover={coverVisible}
          showContent={contentVisible}
          onClick={onCreateNote}
        />
      )}
    </div>
  );
}
