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
export function toNoteCoverImage(
  url: string | null | undefined,
  positionAbove = 50,
  /**
   * The Unsplash credit's wording ("Photo by … on Unsplash"), when the cover is an Unsplash photo.
   * A thumbnail has no room for the credit line the card and page cover draw, so it carries the
   * credit as its tooltip and accessible name (ADR-054).
   */
  attributionLabel?: string
): ReactNode {
  const image = (
    <CollectionImage
      src={url}
      positionY={positionAbove}
      alt={attributionLabel}
      fallback={<AppIcon className="note-cover-image__empty" icon="plus" />}
    />
  );

  return attributionLabel ? (
    <span className="note-cover-image__credited" title={attributionLabel}>
      {image}
    </span>
  ) : (
    image
  );
}
