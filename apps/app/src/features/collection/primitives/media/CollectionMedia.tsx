import type { ReactNode } from 'react';
import './CollectionMedia.css';

export interface CollectionMediaProps {
  /** Whatever fills the frame — an image, a placeholder, anything. The frame draws only itself. */
  readonly children?: ReactNode;
  /**
   * Fill the height of whatever it sits in (a row's leading slot, say) instead of the fixed
   * frame height; the width stays fixed (--cx-collection-media-fill-width). Needs a host that stretches it.
   */
  readonly fillHeight?: boolean;
}

/**
 * A small thumbnail frame: size, border, radius, clipping. Purely visual —
 * hidden from assistive tech, no pointer events. It knows nothing about what
 * it frames.
 */
export function CollectionMedia({ children, fillHeight = false }: CollectionMediaProps) {
  return (
    <div
      className={['cx-collection-media', fillHeight && 'cx-collection-media--fill-height'].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
