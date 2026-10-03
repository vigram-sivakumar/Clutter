/**
 * One column of a collection table: the header cell and the grid track the
 * header and every row share. Generic — a collection declares its own columns
 * (notes: Name + date columns; assets: Name + Type); the table and its rows
 * know nothing about what the columns contain.
 */
export interface CollectionTableColumn {
  readonly id: string;
  readonly label: string;
  /** The grid track width (any `grid-template-columns` size). */
  readonly width: string;
  /** Extra class(es) for the header cell — a collection's hook for column-specific styling/tests. */
  readonly className?: string;
}

/** The `grid-template-columns` value for a set of columns — what the header and each row apply. */
export function buildCollectionTableGridTemplateColumns(
  columns: readonly CollectionTableColumn[]
): string {
  return columns.map((column) => column.width).join(' ');
}
