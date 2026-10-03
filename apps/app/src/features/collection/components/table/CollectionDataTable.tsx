import type { HTMLAttributes, ReactNode } from 'react';

import type { CollectionRowAttributes } from '../collectionRowAttributes';
import type { CollectionTableColumn } from './collectionTableColumns';
import { buildCollectionTableGridTemplateColumns } from './collectionTableColumns';
import { CollectionTable } from './CollectionTable';
import { CollectionTableRow } from './CollectionTableRow';
import {
  CollectionTableMediaCell,
  type CollectionTableMediaCellProps,
} from './cells/CollectionTableMediaCell';
import {
  CollectionTableDateCell,
  type CollectionTableDateCellProps,
} from './cells/CollectionTableDateCell';
import {
  CollectionTableHeaderCell,
  type CollectionTableHeaderCellProps,
} from './cells/CollectionTableHeaderCell';
import {
  CollectionTableTextCell,
  type CollectionTableTextCellProps,
} from './cells/CollectionTableTextCell';

/**
 * One cell's content, tagged with which generic cell draws it. The four kinds
 * are the whole vocabulary of a collection table — a collection never brings
 * its own cell component, it describes its values in these terms.
 */
export type CollectionTableCellValue =
  | ({ readonly kind: 'header' } & CollectionTableHeaderCellProps)
  | ({ readonly kind: 'date' } & CollectionTableDateCellProps)
  | ({ readonly kind: 'text' } & CollectionTableTextCellProps)
  | ({ readonly kind: 'media' } & CollectionTableMediaCellProps);

/** One row: its cells keyed by column id, and how the whole row behaves. */
export interface CollectionDataTableRow {
  readonly id: string;
  /** Keyed by column id. A column with no entry renders an empty cell, so the grid stays aligned. */
  readonly cells: Readonly<Record<string, CollectionTableCellValue>>;
  /** Opens the row (click / Enter / Space). */
  readonly onClick?: () => void;
  /** Hover-revealed overlay at the row's right edge (Archive's Restore / Delete). */
  readonly actions?: ReactNode;
  readonly props?: CollectionRowAttributes;
}

export interface CollectionDataTableProps extends HTMLAttributes<HTMLDivElement> {
  /** The single source of both the header and every row's grid — and of which cell sits in which column. */
  readonly columns: readonly CollectionTableColumn[];
  readonly rows: readonly CollectionDataTableRow[];
  /** Rendered after the rows — a trailing "New …" row, if the collection has one. */
  readonly footer?: ReactNode;
}

function joinClassNames(...names: Array<string | undefined>): string | undefined {
  const joined = names.filter(Boolean).join(' ');
  return joined || undefined;
}

function renderCell(column: CollectionTableColumn, value: CollectionTableCellValue | undefined) {
  const key = column.id;

  if (!value) {
    return <CollectionTableTextCell key={key} className={column.cellClassName} />;
  }

  const className = joinClassNames(column.cellClassName, value.className);

  switch (value.kind) {
    case 'header': {
      const { kind: _kind, ...props } = value;
      return <CollectionTableHeaderCell key={key} {...props} className={className} />;
    }
    case 'date': {
      const { kind: _kind, ...props } = value;
      return <CollectionTableDateCell key={key} {...props} className={className} />;
    }
    case 'text': {
      const { kind: _kind, ...props } = value;
      return <CollectionTableTextCell key={key} {...props} className={className} />;
    }
    case 'media': {
      const { kind: _kind, ...props } = value;
      return <CollectionTableMediaCell key={key} {...props} className={className} />;
    }
  }
}

/**
 * The one table every collection renders in Table mode — notes, assets, the
 * Archive. It owns the whole picture: the header row, the rows, and the cell
 * each column shows. A collection supplies only data — its columns (label,
 * width, hooks) and, per row, a value for each column; the table picks the
 * generic Header / Date / Text / Media cell for each value and keeps header
 * and rows on one grid (both built from `columns`, so they cannot drift).
 * It knows nothing about notes, assets or any other item type.
 */
export function CollectionDataTable({
  columns,
  rows,
  footer,
  ...props
}: CollectionDataTableProps) {
  const gridTemplateColumns = buildCollectionTableGridTemplateColumns(columns);

  return (
    <CollectionTable {...props} columns={columns} footer={footer}>
      {rows.map((row) => (
        <CollectionTableRow
          {...row.props}
          key={row.id}
          gridTemplateColumns={gridTemplateColumns}
          actions={row.actions}
          onClick={row.onClick}
        >
          {columns.map((column) => renderCell(column, row.cells[column.id]))}
        </CollectionTableRow>
      ))}
    </CollectionTable>
  );
}
