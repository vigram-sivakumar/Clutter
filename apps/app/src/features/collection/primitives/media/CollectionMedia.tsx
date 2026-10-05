import type { MouseEvent, ReactNode } from 'react';
import './CollectionMedia.css';

export interface CollectionMediaProps {
  /** Whatever fills the frame — an image, a placeholder, anything. The frame draws only itself. */
  readonly children?: ReactNode;
  /** Makes the frame a button. Its click never reaches an activatable ancestor (rows ignore clicks on nested buttons). */
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The button's accessible name (used only with `onClick`). A purely visual frame is hidden from assistive tech. */
  readonly label?: string;
}

/**
 * A small thumbnail frame: size, border, radius, clipping. It knows nothing
 * about what it frames. With `onClick` it is a button that looks like the frame.
 */
export function CollectionMedia({ children, onClick, label }: CollectionMediaProps) {
  return onClick ? (
    <button
      type="button"
      className="cx-collection-media cx-collection-media--interactive"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <div className="cx-collection-media" aria-hidden="true">
      {children}
    </div>
  );
}
