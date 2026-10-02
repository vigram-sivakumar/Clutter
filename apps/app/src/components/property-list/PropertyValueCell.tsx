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
  /**
   * Actions in Entry's own `actions` slot — revealed only while the cell
   * is hovered (e.g. a URL's Open/Copy).
   */
  actions?: ReactNode;
}

/** The read-only value cell every Property type renders into when it isn't being edited in place. */
export function PropertyValueCell({ children, truncate = false, actions }: PropertyValueCellProps) {
  return (
    <Entry
      className={['property-list__value', truncate && 'property-list__value--truncate']
        .filter(Boolean)
        .join(' ')}
      actions={actions}
    >
      <span>{children}</span>
    </Entry>
  );
}
