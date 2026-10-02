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
}

/** The read-only value cell every Property type renders into when it isn't being edited in place. */
export function PropertyValueCell({ children, truncate = false }: PropertyValueCellProps) {
  return (
    <Entry
      className={['property-list__value', truncate && 'property-list__value--truncate']
        .filter(Boolean)
        .join(' ')}
    >
      <span>{children}</span>
    </Entry>
  );
}
