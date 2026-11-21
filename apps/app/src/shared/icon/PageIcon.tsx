import { useState } from 'react';
import { AppIcon } from './AppIcon';
import type { SystemIcon } from './types';
import './PageIcon.css';

export type PageIconSize = 'small' | 'medium' | 'large';

export interface PageIconProps {
  /** Emoji stored in page or folder metadata. */
  emoji?: string | null;
  /** System-icon fallback when no emoji is available. */
  systemIcon?: SystemIcon;
  /** Resolved, loadable image URL. Vault path resolution belongs outside this component. */
  imageSrc?: string | null;
  /** Icon slot dimensions for sidebar, collection, and page-title contexts. */
  size?: PageIconSize;
  className?: string;
  strokeWidth?: number;
  /** Called when the resolved image cannot be decoded by the WebView. */
  onImageError?: () => void;
}

const SIZE_TOKENS: Record<PageIconSize, { slot: number; glyph: number }> = {
  small: { slot: 20, glyph: 16 },
  medium: { slot: 24, glyph: 16 },
  large: { slot: 72, glyph: 64 },
};

/**
 * Renders a cover image when one is available; otherwise delegates emoji and
 * system-icon rendering to AppIcon. The fallback stays visible until the
 * image has loaded successfully.
 *
 * imageSrc must be a resolved URL. Filesystem lookup and metadata cleanup
 * belong to the caller.
 */
export function PageIcon({
  emoji,
  systemIcon,
  imageSrc,
  size = 'medium',
  className,
  onImageError,
  strokeWidth,
}: PageIconProps) {
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const dimensions = SIZE_TOKENS[size];
  const src = imageSrc?.trim() || null;
  const imageLoaded = src !== null && loadedImage === src;
  const showImage = src !== null && failedImage !== src;
  const style = {
    '--page-icon-slot-size': `${dimensions.slot}px`,
    '--page-icon-glyph-size': `${dimensions.glyph}px`,
  } as React.CSSProperties;

  return (
    <span className={`page-icon ${className ?? ''}`.trim()} style={style}>
      {!imageLoaded && (
        <span className="page-icon__fallback">
          <AppIcon
            icon={systemIcon}
            emoji={emoji}
            size={dimensions.glyph}
            slotSize={dimensions.slot}
            strokeWidth={strokeWidth}
          />
        </span>
      )}
      {showImage && (
        <img
          key={src}
          className="page-icon__image"
          src={src}
          alt=""
          aria-hidden="true"
          style={{ visibility: imageLoaded ? 'visible' : 'hidden' }}
          onLoad={() => setLoadedImage(src)}
          onError={() => {
            setFailedImage(src);
            onImageError?.();
          }}
        />
      )}
    </span>
  );
}
