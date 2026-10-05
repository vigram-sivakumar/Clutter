import type { HTMLAttributes } from 'react';
import { CollectionRow } from '../row/CollectionRow';
import type { CollectionRowAttributes } from '../row/collectionRowAttributes';
import { CollectionTableCell, type CollectionTableCellProps } from './cells/CollectionTableCell';
import { CollectionTable } from './CollectionTable';
import { CollectionTableRow } from './CollectionTableRow';
import {
  buildCollectionTableGridTemplateColumns,
  type CollectionTableColumn,
} from './collectionTableColumns';

/**
 * One cell's content, tagged with its variant. `header`, `text` and `media`
 * are the whole vocabulary of a collection table.
 */
export type CollectionTableCellValue = CollectionTableCellProps;

/** One row: its cells keyed by column id, and how the whole row behaves. */
export interface CollectionDataTableRow {
  readonly id: string;
  /** Keyed by column id. A column with no entry draws an empty cell, so the grid stays aligned. */
  readonly cells: Readonly<Record<string, CollectionTableCellValue>>;
  readonly isSelected?: boolean;
  /** Opens the row (click / Enter / Space). */
  readonly onClick?: () => void;
  /** Extra `data-*` / ARIA attributes for the row. */
  readonly props?: CollectionRowAttributes;
}

export interface CollectionDataTableProps extends HTMLAttributes<HTMLDivElement> {
  /** The single source of both the header and every row's grid — and of which cell sits in which column. */
  readonly columns: readonly CollectionTableColumn[];
  readonly rows: readonly CollectionDataTableRow[];
  /** A trailing "New …" row (`label` is its whole title); absent, none is drawn. */
  readonly newItem?: {
    readonly label: string;
    readonly onClick: () => void;
  };
}

const join = (...names: Array<string | undefined>) => names.filter(Boolean).join(' ') || undefined;

/**
 * A table from data: the header, a row per entry and the generic cell each
 * column's value calls for, with header and rows built from the same
 * `columns`. The caller supplies values only; this draws them. It knows
 * nothing about what a row is.
 */
export function CollectionDataTable({ columns, rows, newItem, ...props }: CollectionDataTableProps) {
  const gridTemplateColumns = buildCollectionTableGridTemplateColumns(columns);

  return (
    <CollectionTable
      {...props}
      columns={columns}
      footer={
        newItem && (
          <CollectionTableRow
            className="cx-collection-table-row--new-item"
            gridTemplateColumns="minmax(0, 1fr)"
            onClick={newItem.onClick}
          >
            <CollectionRow layout="cell" tone="action" icon="plus" title={newItem.label} />
          </CollectionTableRow>
        )
      }
    >
      {rows.map((row) => (
        <CollectionTableRow
          {...row.props}
          key={row.id}
          gridTemplateColumns={gridTemplateColumns}
          isSelected={row.isSelected}
          onClick={row.onClick ? () => row.onClick?.() : undefined}
        >
          {columns.map((column) => {
            const value = row.cells[column.id];
            return value ? (
              <CollectionTableCell
                key={column.id}
                {...value}
                className={join(column.cellClassName, value.className)}
              />
            ) : (
              <CollectionTableCell key={column.id} variant="text" className={column.cellClassName} />
            );
          })}
        </CollectionTableRow>
      ))}
    </CollectionTable>
  );
}
