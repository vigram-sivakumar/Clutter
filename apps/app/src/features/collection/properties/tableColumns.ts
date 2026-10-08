import {
  COLLECTION_PROPERTIES,
  PROPERTY_IDS,
  propertyLabel,
  type PropertyId,
  type PropertyValues,
} from '@core/properties/collectionProperties';
import type { CollectionTableColumn } from '@features/collection/components/table/collectionTableColumns';
import type { CollectionTableTextCellValue } from '@features/collection/components/table/cells/CollectionTableCell';

import { formatPropertyValue, valueProperties } from './formatProperty';

/**
 * A collection table's columns, from the visible properties — one builder for notes and assets
 * alike, because a column is a property drawn as a table column: the Name column always (the row
 * anchor, `minmax(400px, 1fr)`), then — in canonical property order — the Cover image column when
 * it is visible AND the host can change covers (`110px`), then every plain value property that
 * is visible (`140px`, or content-sized for a date — see `valueColumnWidth`). A property that is not visible reserves no grid space at all.
 *
 * Widths, classes and the cell shape are this layout's presentation; the property's id, label
 * and order are the registry's.
 */
export interface PropertyTableColumnOptions {
  /** Whether the Cover image column can be drawn at all — only when the host can change a cover. */
  readonly cover?: boolean;
  /**
   * A column header that deliberately reads differently from the property's label. Only the
   * assets table uses it: its File size column has always been headed "Size".
   */
  readonly headers?: Partial<Record<PropertyId, string>>;
}

/**
 * The grid track a plain value property's column gets, decided by the property's TYPE so every
 * property of a kind behaves the same: a date (`date`, `day`) is sized by its content (`max-content` —
 * the table is a grid whose rows are subgrids, so the column is as wide as the widest rendered date
 * and a short one makes no wider a column); everything else keeps its fixed 140px.
 */
export function valueColumnWidth(id: PropertyId): string {
  const type = COLLECTION_PROPERTIES[id].type;

  return type === 'date' || type === 'day' ? 'max-content' : '140px';
}

export function buildPropertyTableColumns(
  visible: readonly PropertyId[],
  { cover = false, headers = {} }: PropertyTableColumnOptions = {}
): CollectionTableColumn[] {
  const columns: CollectionTableColumn[] = [
    {
      id: 'name',
      label: headers.name ?? propertyLabel('name'),
      width: 'minmax(400px, 1fr)',
      className: 'collection-table__header-cell--name',
    },
  ];

  for (const id of PROPERTY_IDS) {
    if (id === 'cover') {
      if (cover && visible.includes('cover')) {
        columns.push({
          id,
          label: headers.cover ?? propertyLabel('cover'),
          width: '110px',
          className: 'collection-table__header-cell--cover',
          cellClassName: 'collection-table-row__cover',
        });
      }
    } else if (valueProperties(visible).includes(id)) {
      columns.push({
        id,
        label: headers[id] ?? propertyLabel(id),
        width: valueColumnWidth(id),
        className: `collection-table__header-cell--${id}`,
        cellClassName: `collection-table-row__${id}`,
      });
    }
  }

  return columns;
}

/**
 * The text cells of a row, one per visible plain-value property, keyed by the column ids
 * `buildPropertyTableColumns` declares. A date also exposes the instant it stands for.
 */
export function propertyValueCells(
  visible: readonly PropertyId[],
  values: PropertyValues
): Record<string, CollectionTableTextCellValue> {
  return Object.fromEntries(
    valueProperties(visible).map((id) => {
      const raw = values[id];

      return [
        id,
        {
          variant: 'text' as const,
          value: formatPropertyValue(id, values),
          ...(typeof raw === 'string' && { dateTime: raw }),
        },
      ];
    })
  );
}
