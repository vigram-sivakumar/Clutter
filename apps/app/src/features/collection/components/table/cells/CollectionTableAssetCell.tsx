import type { ReactNode } from 'react';

import './CollectionTableCells.css';

export interface CollectionTableAssetCellProps {
  /**
   * The thumbnail's content — an image, a rendered PDF page, anything that
   * fills a small square. The cell draws only the frame around it; what is
   * shown (and how a failed load degrades) is the caller's concern, so this
   * cell knows no asset kinds.
   */
  readonly children?: ReactNode;
  /** A column hook, e.g. `collection-table-row__preview`. */
  readonly className?: string;
}

/**
 * An asset column's cell: a small, row-height square frame (border, radius,
 * clipping) holding a thumbnail the caller supplies. Generic — it imports
 * nothing about images, PDFs or any collection; the asset layer fills the
 * frame (`AssetThumbnail`). Purely visual (`aria-hidden`) — the row's header
 * cell carries the accessible name.
 */
export function CollectionTableAssetCell({ children, className }: CollectionTableAssetCellProps) {
  return (
    <div
      className={['collection-table-cell', 'collection-table-cell--asset', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="collection-table-cell__thumbnail" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
