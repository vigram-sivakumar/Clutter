import type { HTMLAttributes, ReactNode } from 'react';

import './CollectionCardGrid.css';

export interface CollectionCardGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * The Card layout's container — the one grid every collection's cards sit on.
 * It owns only what is generic: the columns and gap (shared with FolderGrid),
 * and the card shape/gap custom properties its `CollectionCard`s inherit. What
 * goes inside a card (a note's document preview, an asset's image) is the
 * collection's own card component.
 */
export function CollectionCardGrid({ children, className, ...props }: CollectionCardGridProps) {
  return (
    <div
      {...props}
      className={['collection-card-grid', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
