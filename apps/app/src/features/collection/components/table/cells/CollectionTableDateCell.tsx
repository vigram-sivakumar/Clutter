import { CollectionEntry } from '@features/collection/CollectionEntry';

import './CollectionTableCells.css';

export interface CollectionTableDateCellProps {
  /**
   * The date as it should read (already formatted by the caller — the same
   * strings the collection's date columns use today). Absent, the cell stays
   * empty but still occupies its grid track, so columns never shift.
   */
  readonly value?: string;
  /**
   * The machine-readable date (ISO 8601), when the caller has one — exposed as
   * `data-date` for tests and future tooltips; never rendered.
   */
  readonly dateTime?: string;
  /** A column hook, e.g. `collection-table-row__created`. */
  readonly className?: string;
}

/**
 * A date column's cell (Last opened, Created, Updated, Archived, or any
 * future date field): one muted metadata line, aligned with the header cell
 * above it. Generic — it formats nothing and knows no field names; the column
 * definition and the caller decide both.
 */
export function CollectionTableDateCell({ value, dateTime, className }: CollectionTableDateCellProps) {
  return (
    <CollectionEntry
      className={['collection-table-cell', 'collection-table-cell--date', className]
        .filter(Boolean)
        .join(' ')}
      data-date={dateTime}
      metadata={value}
    />
  );
}
