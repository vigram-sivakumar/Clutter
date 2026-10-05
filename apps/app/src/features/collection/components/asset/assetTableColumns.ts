import type { CollectionTableColumn } from '@features/collection/components/table/collectionTableColumns';

/**
 * The asset table's columns: the name (led by the asset's preview — the image, or a PDF's
 * first page), the kind and where it lives (the vault, or a remote URL). An
 * asset carries nothing else worth a column (no description).
 */
export const ASSET_TABLE_COLUMNS: readonly CollectionTableColumn[] = [
  {
    id: 'name',
    label: 'Name',
    width: 'minmax(400px, 1fr)',
    className: 'collection-table__header-cell--name',
  },
  {
    id: 'type',
    label: 'Type',
    width: '140px',
    className: 'collection-table__header-cell--type',
    cellClassName: 'collection-table-row__type',
  },
  {
    id: 'source',
    label: 'Source',
    width: '140px',
    className: 'collection-table__header-cell--source',
    cellClassName: 'collection-table-row__source',
  },
];
