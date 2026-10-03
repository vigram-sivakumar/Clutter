import type { HTMLAttributes, ReactNode } from 'react';

import {
  buildCollectionTableGridTemplateColumns,
  type CollectionTableColumn,
} from './collectionTableColumns';
import './CollectionTable.css';

export interface CollectionTableProps extends HTMLAttributes<HTMLDivElement> {
  /** The columns: the header cells, and the grid every row (`CollectionTableRow`) must share. */
  columns: readonly CollectionTableColumn[];
  /** The rows. */
  children?: ReactNode;
  /** Rendered after the rows inside the body — a collection's trailing "new item" row, if any. */
  footer?: ReactNode;
}

/**
 * The Table layout's container and header — shared by every collection's
 * table view. It owns the scroll container, the header row and its cells; a
 * collection supplies its columns, its rows and (optionally) a trailing row.
 */
export function CollectionTable({
  columns,
  children,
  footer,
  className,
  ...props
}: CollectionTableProps) {
  const gridTemplateColumns = buildCollectionTableGridTemplateColumns(columns);

  return (
    <div
      {...props}
      className={['collection-table', className].filter(Boolean).join(' ')}
    >
      <div className="collection-table__header" style={{ gridTemplateColumns }}>
        {columns.map((column) => (
          <div
            key={column.id}
            className={['collection-table__header-cell', column.className]
              .filter(Boolean)
              .join(' ')}
          >
            {column.label}
          </div>
        ))}
      </div>

      <div className="collection-table__body">
        {children}
        {footer}
      </div>
    </div>
  );
}
