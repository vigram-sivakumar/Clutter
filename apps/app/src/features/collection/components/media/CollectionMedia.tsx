import type { MouseEvent, ReactNode } from 'react';

import './CollectionMedia.css';

export interface CollectionMediaProps {
  /**
   * The thumbnail's content — an image, a rendered PDF page, a placeholder
   * icon, anything that fills a small landscape frame. The frame draws only itself;
   * what is shown (and how a failed load degrades) is the caller's concern,
   * so this knows nothing about what the media is.
   */
  readonly children?: ReactNode;
  /**
   * Makes the thumbnail a button — e.g. to open a picker that changes it.
   * Clicking it never opens the row (rows ignore clicks on nested buttons).
   * Absent, the thumbnail is purely visual.
   */
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The button's accessible name (used only with `onClick`); a purely visual thumbnail is hidden from assistive tech. */
  readonly label?: string;
}

/**
 * The one thumbnail frame every collection layout shares — a small landscape
 * frame (border, radius, clipping) around whatever the caller supplies: a cover
 * image, an asset preview, any future media. The table's media cell and the
 * list's media slot both draw it, so a thumbnail looks identical in either.
 * Generic: it imports nothing about images, PDFs or any collection.
 */
export function CollectionMedia({ children, onClick, label }: CollectionMediaProps) {
  return onClick ? (
    <button
      type="button"
      className="collection-media collection-media--interactive"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <div className="collection-media" aria-hidden="true">
      {children}
    </div>
  );
}
