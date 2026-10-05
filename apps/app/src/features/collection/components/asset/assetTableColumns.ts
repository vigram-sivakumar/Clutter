import { collectionFieldLabel } from '../../collectionFieldLabels';
import type { CollectionTableColumn } from '@features/collection/components/table/collectionTableColumns';

/**
 * Which of the asset table's optional columns (beyond Name) are
 * visible — the same Properties the card shows (File size, Created, Last
 * edited), so one set of toggles governs every layout.
 */
export interface AssetTableColumnVisibility {
  readonly size: boolean;
  readonly created: boolean;
  readonly updated: boolean;
}

/**
 * The asset table's columns: the name (led by the asset's preview — the image,
 * or a PDF's first page), always; then File size, Created and Last
 * edited as the Properties turn them on (a hidden column reserves no
 * grid space at all). The same file facts the card lists as metadata lines.
 */
export function buildAssetTableColumns({ size, created, updated }: AssetTableColumnVisibility): CollectionTableColumn[] {
  const columns: CollectionTableColumn[] = [
    {
      id: 'name',
      label: 'Name',
      width: 'minmax(400px, 1fr)',
      className: 'collection-table__header-cell--name',
    },
  ];
  const optional = [
    { on: size, id: 'size', label: 'Size' },
    { on: created, id: 'created', label: collectionFieldLabel('created') },
    { on: updated, id: 'updated', label: collectionFieldLabel('updated') },
  ] as const;

  for (const { on, id, label } of optional) {
    if (on) {
      columns.push({
        id,
        label,
        width: '140px',
        className: `collection-table__header-cell--${id}`,
        cellClassName: `collection-table-row__${id}`,
      });
    }
  }

  return columns;
}
