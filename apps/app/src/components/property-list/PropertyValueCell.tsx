import type { ReactNode } from 'react';

import { Entry } from '@components/entry/Entry';

/** The read-only value cell every Property type renders into when it isn't being edited in place. */
export function PropertyValueCell({ children }: { children: ReactNode }) {
  return (
    <Entry className="property-list__value">
      <span>{children}</span>
    </Entry>
  );
}
