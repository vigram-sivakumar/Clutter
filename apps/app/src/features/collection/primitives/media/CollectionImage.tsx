import { useState, type ReactNode } from 'react';
import './CollectionImage.css';

export interface CollectionImageProps {
  /** A loadable image URL (the caller resolves it). Absent, or failing to load, shows `fallback` instead. */
  readonly src?: string | null;
  /** Which part of the image to keep when it is cropped to fill: the vertical focal point, 0 (top) to 100 (bottom). Default 50 (centred). */
  readonly positionY?: number;
  /** Shown in place of the image when there is no `src` or it fails to load — an icon, for one. Absent, nothing is shown. */
  readonly fallback?: ReactNode;
  /** Default empty: the image is decorative. */
  readonly alt?: string;
  readonly className?: string;
}

/**
 * An image that fills whatever box it is in, cropped to cover it (framed by
 * `positionY`), with a fallback for when there is nothing to show or it
 * doesn't load. It knows nothing about what the image is — a note's cover, an
 * asset, anything.
 */
export function CollectionImage({
  src,
  positionY = 50,
  fallback,
  alt = '',
  className,
}: CollectionImageProps) {
  // The URL that failed, so a new `src` gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return fallback ? (
      <span className={['cx-collection-image__fallback', className].filter(Boolean).join(' ')}>{fallback}</span>
    ) : null;
  }

  return (
    <img
      className={['cx-collection-image', className].filter(Boolean).join(' ')}
      src={src}
      alt={alt}
      draggable={false}
      loading="lazy"
      style={{ objectPosition: `50% ${positionY}%` }}
      onError={() => setFailedSrc(src)}
    />
  );
}
