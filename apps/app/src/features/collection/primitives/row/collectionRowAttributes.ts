import type { HTMLAttributes } from 'react';

/**
 * Extra attributes a collection row may carry in the data list and table —
 * `data-*` hooks and ARIA. The row's own content, class and click are set
 * through its data model, never here.
 */
export type CollectionRowAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onClick' | 'className'
> & { readonly [attribute: `data-${string}`]: string | undefined };
