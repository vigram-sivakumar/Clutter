/**
 * One column of a collection table: its header cell, and the grid track the
 * header and every row share. Generic — a collection declares its own columns;
 * the table and its rows know nothing about what they contain.
 */
export interface CollectionTableColumn {
  readonly id: string;
  readonly label: string;
  /** The grid track width (any `grid-template-columns` size). */
  readonly width: string;
  /** Extra class(es) for the header cell — a hook for column-specific styling and tests. */
  readonly className?: string;
  /** Extra class(es) for this column's cell in every row (`CollectionDataTable` applies it). */
  readonly cellClassName?: string;
}

/** The `grid-template-columns` value for a set of columns — what the header and every row apply, so they cannot drift. */
export function buildCollectionTableGridTemplateColumns(columns: readonly CollectionTableColumn[]): string {
  return columns.map((column) => column.width).join(' ');
}
