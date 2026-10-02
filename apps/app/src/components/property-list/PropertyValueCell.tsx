import type { ReactNode } from 'react';

import { Entry } from '@components/entry/Entry';

interface PropertyValueCellProps {
  children: ReactNode;
  /**
   * Keeps the value on one line with an ellipsis instead of wrapping (the
   * cell's default) — for values like URLs, where a wrapped fragment
   * reads worse than a truncated one.
   */
  truncate?: boolean;
  /** Trailing content in the cell's own trailing slot (e.g. a URL's actions). */
  trailing?: ReactNode;
}

/** The read-only value cell every Property type renders into when it isn't being edited in place. */
export function PropertyValueCell({ children, truncate = false, trailing }: PropertyValueCellProps) {
  return (
    <Entry
      className={['property-list__value', truncate && 'property-list__value--truncate']
        .filter(Boolean)
        .join(' ')}
      trailing={trailing}
    >
      <span>{children}</span>
    </Entry>
  );
}
