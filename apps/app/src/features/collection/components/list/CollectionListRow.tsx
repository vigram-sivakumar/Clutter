import { forwardRef } from 'react';

import { CollectionEntry, type CollectionEntryProps } from '@features/collection/CollectionEntry';

import './CollectionListRow.css';

/**
 * The List layout's row: a `CollectionEntry` with the list-row treatment
 * (radius, hover and selected backgrounds, title/description left and
 * metadata trailing, the hover-revealed select checkbox). Generic — notes and
 * assets both render their rows with it, supplying only their own fields.
 */
export const CollectionListRow = forwardRef<HTMLDivElement, CollectionEntryProps>(
  function CollectionListRow({ className, ...props }, ref) {
    return (
      <CollectionEntry
        {...props}
        ref={ref}
        className={['collection-list-row', className].filter(Boolean).join(' ')}
      />
    );
  }
);

CollectionListRow.displayName = 'CollectionListRow';
