import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import './CollectionGrid.css';

export interface CollectionGridColumns {
  /** The narrowest an item may get, in px. The grid drops to fewer columns rather than go below it. */
  readonly min: number;
  /** The most columns in a row (each item is then at least 1/max of the row, minus the gaps). */
  readonly max: number;
}

export interface CollectionGridProps extends HTMLAttributes<HTMLDivElement> {
  columns: CollectionGridColumns;
  /** A fixed height, in px, for every row. Omit and rows size to their content. */
  rowHeight?: number;
  children: ReactNode;
}

/**
 * A responsive grid and nothing else: `auto-fill` columns between `columns.min`
 * px and `1 / columns.max` of the row, one shared gap, optionally fixed-height
 * rows. It knows nothing about what it holds — a card, a tile, any element.
 * The numbers reach the stylesheet as custom properties.
 */
export function CollectionGrid({
  columns,
  rowHeight,
  className,
  style,
  children,
  ...props
}: CollectionGridProps) {
  const hasRowHeight = rowHeight !== undefined;
  const gridStyle = {
    '--cx-collection-grid-min': `${Math.max(1, columns.min)}px`,
    '--cx-collection-grid-max': Math.max(1, Math.floor(columns.max)),
    ...(hasRowHeight ? { '--cx-collection-grid-row-height': `${rowHeight}px` } : {}),
    ...style,
  } as CSSProperties;

  return (
    <div
      {...props}
      className={['cx-collection-grid', hasRowHeight && 'cx-collection-grid--fixed-rows', className]
        .filter(Boolean)
        .join(' ')}
      style={gridStyle}
    >
      {children}
    </div>
  );
}
