import type { HTMLAttributes, ReactNode } from 'react';
import './CollectionRowList.css';

export interface CollectionRowListProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * A flat list of full-width rows (tasks, resources) — the same role
 * FolderGrid and the collection table already play as the single flex child of
 * `.collection__content` (CollectionBody.css), so `.collection__content`'s
 * own `gap: 40px` (meant to separate a handful of major sections) lands
 * between this list and its siblings, never between the individual rows
 * inside it. Internal row spacing (`gap: var(--space-1)`) matches the
 * sidebar's own Section.css, since Task rows here are the exact same
 * component the sidebar renders.
 */
export function CollectionRowList({
  children,
  className,
  ...props
}: CollectionRowListProps) {
  return (
    <div
      {...props}
      className={['collection-row-list', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
