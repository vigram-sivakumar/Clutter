import type { HTMLAttributes } from 'react';

/**
 * Extra attributes a collection row may carry in the generic table and list —
 * `data-*` hooks (`data-resource-id`, which the Assets body's F2-to-rename
 * handler looks up) and ARIA. The row's own content, class and click are set
 * through its model, never here.
 */
export type CollectionRowAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onClick' | 'className'
> & { readonly [attribute: `data-${string}`]: string | undefined };
