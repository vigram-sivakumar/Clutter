import type { MouseEvent, ReactNode } from 'react';
import './CollectionMedia.css';

export interface CollectionMediaProps {
  /** Whatever fills the frame — an image, a placeholder, anything. The frame draws only itself. */
  readonly children?: ReactNode;
  /** Makes the frame a button. Its click never reaches an activatable ancestor (rows ignore clicks on nested buttons). */
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** The button's accessible name (used only with `onClick`). A purely visual frame is hidden from assistive tech. */
  readonly label?: string;
  /**
   * Fill the height of whatever it sits in (a row's leading slot, say) instead of the fixed
   * frame height; the width stays fixed (--cx-collection-media-fill-width). Needs a host that stretches it.
   */
  readonly fillHeight?: boolean;
}

/**
 * A small thumbnail frame: size, border, radius, clipping. It knows nothing
 * about what it frames. With `onClick` it is a button that looks like the frame.
 */
export function CollectionMedia({ children, onClick, label, fillHeight = false }: CollectionMediaProps) {
  const frame = ['cx-collection-media', fillHeight && 'cx-collection-media--fill-height'];
  return onClick ? (
    <button
      type="button"
      className={[...frame, 'cx-collection-media--interactive'].filter(Boolean).join(' ')}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <div className={frame.filter(Boolean).join(' ')} aria-hidden="true">
      {children}
    </div>
  );
}
