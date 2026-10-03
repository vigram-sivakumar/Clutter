import { CollectionMedia, type CollectionMediaProps } from '../../media/CollectionMedia';

import './CollectionTableCells.css';

export interface CollectionTableMediaCellProps extends CollectionMediaProps {
  /** A column hook, e.g. `collection-table-row__preview`. */
  readonly className?: string;
}

/**
 * A media column's cell: the shared thumbnail frame (`CollectionMedia`) in a
 * grid cell — a cover image, an asset preview, any future media. Generic: it
 * imports nothing about images, PDFs or any collection; each collection fills
 * the frame (`AssetThumbnail`, `NoteCoverThumbnail`). Purely visual unless
 * given an `onClick`, in which case the frame is a labelled button — the row's
 * header cell carries the accessible name of the row itself.
 */
export function CollectionTableMediaCell({
  children,
  onClick,
  label,
  className,
}: CollectionTableMediaCellProps) {
  return (
    <div
      className={['collection-table-cell', 'collection-table-cell--media', className]
        .filter(Boolean)
        .join(' ')}
    >
      <CollectionMedia onClick={onClick} label={label}>
        {children}
      </CollectionMedia>
    </div>
  );
}
