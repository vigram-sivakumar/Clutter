import type { MouseEvent, ReactNode } from 'react';

import './CollectionTableCells.css';

export interface CollectionTableMediaCellProps {
  /**
   * The thumbnail's content — an image, a rendered PDF page, a placeholder
   * icon, anything that fills a small square. The cell draws only the frame
   * around it; what is shown (and how a failed load degrades) is the caller's
   * concern, so this cell knows nothing about what the media is.
   */
  readonly children?: ReactNode;
  /**
   * Makes the thumbnail a button — e.g. to open a picker that changes it.
   * Clicking it never opens the row (the row ignores clicks on nested
   * buttons). Absent, the thumbnail is purely visual.
   */
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The button's accessible name (used only with `onClick`); a purely visual thumbnail is hidden from assistive tech. */
  readonly label?: string;
  /** A column hook, e.g. `collection-table-row__preview`. */
  readonly className?: string;
}

/**
 * A media column's cell: a small, row-height square frame (border, radius,
 * clipping) holding a thumbnail the caller supplies — a cover image, an asset
 * preview, any future media. Generic: it imports nothing about images, PDFs
 * or any collection; each collection fills the frame (`AssetThumbnail`,
 * `NoteCoverThumbnail`). Purely visual unless given an `onClick`, in which
 * case the frame is a labelled button — the row's header cell carries the
 * accessible name of the row itself.
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
      {onClick ? (
        <button
          type="button"
          className="collection-table-cell__thumbnail collection-table-cell__thumbnail--interactive"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      ) : (
        <div className="collection-table-cell__thumbnail" aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}
