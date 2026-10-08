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
 * The table's container and header: the scroll container — ONE grid that owns the columns — the
 * header row and its cells, and the body the rows sit in. The header, the body and every row are
 * subgrids of it, so a column sized by its content (`max-content`) is as wide as its widest cell
 * across the header and all rows, and the columns can never drift apart. It knows nothing about what the
 * rows represent.
 */
export function CollectionTable({ columns, children, footer, className, style, ...props }: CollectionTableProps) {
  const gridTemplateColumns = buildCollectionTableGridTemplateColumns(columns);

  return (
    <div
      {...props}
      className={['collection-table', className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns, ...style }}
    >
      <div className="collection-table__header">
        {columns.map((column) => (
          <div
            key={column.id}
            className={['collection-table__header-cell', column.className].filter(Boolean).join(' ')}
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
