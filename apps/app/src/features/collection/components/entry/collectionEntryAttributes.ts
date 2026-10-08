import type { HTMLAttributes } from 'react';

/**
 * Extra attributes a collection entry may carry in the data list and table —
 * `data-*` hooks and ARIA. The entry's own content, class and click are set
 * through its data model, never here.
 */
export type CollectionEntryAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onClick' | 'className'
> & { readonly [attribute: `data-${string}`]: string | undefined };
