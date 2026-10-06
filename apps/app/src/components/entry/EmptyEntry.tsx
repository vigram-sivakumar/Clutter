import type { ReactNode } from 'react';
import { Entry } from './Entry';
import './EmptyEntry.css';

export interface EmptyEntryProps {
  /** What the empty list says ("No folders"). */
  children: ReactNode;
  /** Indent, in the same tree levels every Entry uses — match the rows it stands in for. */
  level?: number;
  /** Optional leading slot (an icon, or a spacer to line the text up under sibling rows' titles). */
  leading?: ReactNode;
  /** Present: the row is a quiet call to action (hover, keyboard activation). Absent: plain text. */
  onClick?: () => void;
}

/**
 * The row a list shows when it has nothing in it: an Entry with muted text and no hover or
 * selection of its own, so it sits among sibling rows at their height and indent. Generic — it
 * knows nothing about what the list holds, and the caller decides where (and whether) to draw it.
 */
export function EmptyEntry({ children, level, leading, onClick }: EmptyEntryProps) {
  return (
    <Entry className="empty-entry" level={level} leading={leading} onClick={onClick} role={onClick ? undefined : 'status'}>
      {children}
    </Entry>
  );
}
