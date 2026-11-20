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

interface IconFallbackProps {
  icon?: SystemIcon;
  emoji?: string | null;
  size?: number;
  slotSize?: number;
}

function IconFallback({ icon, emoji, size, slotSize }: IconFallbackProps) {
  return <AppIcon icon={icon} emoji={emoji} size={size} slotSize={slotSize} />;
}

function ImageIcon({
  src,
  icon,
  emoji,
  size,
  slotSize,
}: IconFallbackProps & { src: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  if (status === 'failed') {
    return <IconFallback icon={icon} emoji={emoji} size={size} slotSize={slotSize} />;
  }

  return (
    <span className="page-icon page-icon--image">
      {status === 'loading' && (
        <IconFallback icon={icon} emoji={emoji} size={size} slotSize={slotSize} />
      )}
      <img
        className="page-icon__image"
        src={src}
        alt=""
        aria-hidden="true"
        style={status === 'loading' ? { display: 'none' } : undefined}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
    </span>
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
  const fallback = <IconFallback icon={icon} emoji={emoji} size={size} slotSize={slotSize} />;
  const src = imageSrc?.trim() ? imageSrc : null;

  if (!src) {
    return className ? <span className={className}>{fallback}</span> : fallback;
  }

  return (
    <span className={`page-icon-container ${className ?? ''}`.trim()}>
      <ImageIcon
        key={src}
        src={src}
        icon={icon}
        emoji={emoji}
        size={size}
        slotSize={slotSize}
      />
    </span>
  );
}
