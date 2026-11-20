import { useState } from 'react';
import { AppIcon } from './AppIcon';
import type { SystemIcon } from './types';
import './PageIcon.css';

export interface PageIconProps {
  /** The page or folder's default system icon. */
  icon?: SystemIcon;
  /** The page or folder's optional emoji override. */
  emoji?: string | null;
  /** A resolved, loadable image URL. Vault path resolution belongs outside this component. */
  imageSrc?: string | null;
  /** Size of the system icon glyph. */
  size?: number;
  /** Size of the icon slot, matching AppIcon's layout. */
  slotSize?: number;
  className?: string;
}

function LoadedImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      className="page-icon__image"
      src={src}
      alt=""
      aria-hidden="true"
      style={loaded ? undefined : { display: 'none' }}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Shared page/folder identity icon. The existing AppIcon remains the single
 * implementation for emoji and system-icon rendering; an image replaces it
 * only after the browser confirms that the image has loaded successfully.
 *
 * Pass a resolved URL in imageSrc. This component deliberately does not
 * inspect the filesystem or mutate metadata.
 */
export function PageIcon({
  icon,
  emoji,
  imageSrc,
  size,
  slotSize,
  className,
}: PageIconProps) {
  const hasImage = Boolean(imageSrc?.trim());

  return (
    <span className={`page-icon ${className ?? ''}`.trim()}>
      <AppIcon icon={icon} emoji={emoji} size={size} slotSize={slotSize} />
      {hasImage && <LoadedImage key={imageSrc} src={imageSrc!} />}
    </span>
  );
}
