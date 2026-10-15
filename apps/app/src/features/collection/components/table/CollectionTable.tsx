import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
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
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollsX = useHorizontalOverflow(tableRef);

  return (
    <div
      {...props}
      ref={tableRef}
      className={['collection-table', scrollsX && 'collection-table--scrolls', className].filter(Boolean).join(' ')}
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

/**
 * Whether the element's content is genuinely wider than it (more than a rounded pixel — a fractional
 * grid track must not make a table scrollable). The table is a horizontal scroller only while this is
 * true: a scroller that has nothing to scroll still lets the platform flash its scrollbar when a
 * trackpad touch begins over it (a two-finger right-click), over the last row.
 */
function useHorizontalOverflow(ref: RefObject<HTMLElement>): boolean {
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => setOverflows(element.scrollWidth - element.clientWidth > 1);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    // The table itself (its width) and its content (columns and rows added or resized).
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    Array.from(element.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [ref]);

  return overflows;
}
