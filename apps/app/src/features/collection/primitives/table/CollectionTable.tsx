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
  /** Rendered after the rows, inside the body — a trailing "new item" row, for one. */
  footer?: ReactNode;
}

/**
 * The table's container and header: the scroll container, the header row and
 * its cells, and the body the rows sit in. It knows nothing about what the
 * rows represent.
 */
export function CollectionTable({ columns, children, footer, className, ...props }: CollectionTableProps) {
  const gridTemplateColumns = buildCollectionTableGridTemplateColumns(columns);

  return (
    <div {...props} className={['cx-collection-table', className].filter(Boolean).join(' ')}>
      <div className="cx-collection-table__header" style={{ gridTemplateColumns }}>
        {columns.map((column) => (
          <div
            key={column.id}
            className={['cx-collection-table__header-cell', column.className].filter(Boolean).join(' ')}
          >
            {column.label}
          </div>
        ))}
      </div>
      <div className="cx-collection-table__body">
        {children}
        {footer}
      </div>
    </div>
  );
}
