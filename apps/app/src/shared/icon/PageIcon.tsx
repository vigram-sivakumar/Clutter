import { useState } from 'react';
import { AppIcon } from './AppIcon';
import type { SystemIcon } from './types';
import './PageIcon.css';

export type PageIconSize = 'small' | 'medium' | 'large';

export interface PageIconProps {
  /** Emoji stored in page or folder metadata. */
  emoji?: string | null;
  /** Optional system-icon fallback when no emoji is available. */
  systemIcon?: SystemIcon;
  /** A resolved, loadable image URL. Vault path resolution belongs outside this component. */
  imageSrc?: string | null;
  /** Consistent dimensions for each UI context: sidebar, collection, and page title. */
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

interface FallbackProps {
  emoji?: string | null;
  systemIcon?: SystemIcon;
  glyphSize: number;
  slotSize: number;
  strokeWidth?: number;
}

function IconFallback({ emoji, systemIcon, glyphSize, slotSize, strokeWidth }: FallbackProps) {
  return <AppIcon icon={systemIcon} emoji={emoji} size={glyphSize} slotSize={slotSize} strokeWidth={strokeWidth} />;
}

function ImageLayer({
  src,
  fallback,
  onImageError,
}: {
  src: string;
  fallback: React.ReactNode;
  onImageError?: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  if (status === 'failed') return <span className="page-icon__fallback">{fallback}</span>;

  return (
    <>
      <span
        className="page-icon__fallback"
        style={status === 'loaded' ? { visibility: 'hidden' } : undefined}
      >
        {fallback}
      </span>
      <img
        className="page-icon__image"
        src={src}
        alt=""
        aria-hidden="true"
        style={status === 'loading' ? { visibility: 'hidden' } : undefined}
        onLoad={() => setStatus('loaded')}
        onError={() => {
          setStatus('failed');
          onImageError?.();
        }}
      />
    </>
  );
}

/**
 * Shared page/folder identity icon. AppIcon remains responsible for emoji and
 * system-icon rendering. Images replace the fallback only after loading.
 *
 * Pass a resolved URL in imageSrc. This component does not inspect the
 * filesystem or mutate metadata.
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
  const dimensions = SIZE_TOKENS[size];
  const fallback = (
    <IconFallback emoji={emoji} systemIcon={systemIcon} glyphSize={dimensions.glyph} slotSize={dimensions.slot} strokeWidth={strokeWidth} />
  );
  const src = imageSrc?.trim() || null;
  const style = {
    '--page-icon-slot-size': `${dimensions.slot}px`,
    '--page-icon-glyph-size': `${dimensions.glyph}px`,
  } as React.CSSProperties;

  return (
    <span className={`page-icon ${className ?? ''}`.trim()} style={style}>
      {src ? (
        <ImageLayer key={src} src={src} fallback={fallback} onImageError={onImageError} />
      ) : (
        <span className="page-icon__fallback">{fallback}</span>
      )}
    </span>
  );
}
