import { CollectionEntry } from '@features/collection/CollectionEntry';

import './CollectionTableCells.css';

export interface CollectionTableTextCellProps {
  /** The text as it should read. Absent, the cell stays empty but still occupies its grid track. */
  readonly value?: string;
  /** A column hook, e.g. `collection-table-row__type`. */
  readonly className?: string;
}

/**
 * A plain-text column's cell (an asset's Type, or any future label-like
 * field): one muted metadata line. The same look as `CollectionTableDateCell`,
 * kept separate so a date column and a text column say what they are.
 */
export function CollectionTableTextCell({ value, className }: CollectionTableTextCellProps) {
  return (
    <CollectionEntry
      className={['collection-table-cell', 'collection-table-cell--text', className]
        .filter(Boolean)
        .join(' ')}
      metadata={value}
    />
  );
}
