import { useState } from 'react';

import { AppIcon } from '@shared/icon';

import './NoteCoverThumbnail.css';

export interface NoteCoverThumbnailProps {
  /** The note's cover as a loadable URL (resolved by the caller — this component never resolves anything). Absent: the note has no (visible) cover. */
  readonly url?: string | null;
  /** Vertical focal point (0–100) the note's cover was framed with — the same value the Card view's cover uses. Defaults to centered. */
  readonly positionAbove?: number;
}

/**
 * What goes inside the generic table's media cell for a note's cover: the
 * cover image cropped to fill the thumbnail (framed at the note's own focal
 * point), or a plus icon when the note has no cover — or the image fails to
 * load — so there is always something obvious to click to add one.
 */
export function NoteCoverThumbnail({ url, positionAbove = 50 }: NoteCoverThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return <AppIcon className="note-cover-thumbnail__empty" icon="plus" />;
  }

  return (
    <img
      className="note-cover-thumbnail__image"
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      style={{ objectPosition: `50% ${positionAbove}%` }}
      onError={() => setFailedUrl(url)}
    />
  );
}
