import type { HTMLAttributes, ReactNode } from 'react';

import './CollectionListGrid.css';

export interface CollectionListGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * The List layout's container — the one column of rows every collection's list
 * view sits in (notes, assets). It owns only the layout (a flush column);
 * what a row looks like is `CollectionListRow`, and what it shows is the
 * collection's own row component.
 */
export function CollectionListGrid({ children, className, ...props }: CollectionListGridProps) {
  return (
    <div
      {...props}
      className={['collection-list-grid', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
