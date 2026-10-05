import type { ReactNode } from 'react';
import { AppIcon } from '@shared/icon';
import { CollectionImage } from '@features/collection/components/media/CollectionImage';
import './toNoteCoverImage.css';

/**
 * What goes inside the generic media frame for a note's cover: the cover
 * cropped to fill it (framed at the note's own focal point), or a plus icon
 * when the note has no cover — or it fails to load — so there is always
 * something obvious to click to add one. `url` is the cover already resolved
 * to a loadable URL.
 */
export function toNoteCoverImage(url: string | null | undefined, positionAbove = 50): ReactNode {
  return (
    <CollectionImage
      src={url}
      positionY={positionAbove}
      fallback={<AppIcon className="note-cover-image__empty" icon="plus" />}
    />
  );
}
