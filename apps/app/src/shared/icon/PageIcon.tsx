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
}

const SIZE_TOKENS: Record<PageIconSize, { slot: number; glyph: number }> = {
  small: { slot: 20, glyph: 16 },
  medium: { slot: 24, glyph: 20 },
  large: { slot: 72, glyph: 64 },
};

interface FallbackProps {
  emoji?: string | null;
  systemIcon?: SystemIcon;
  glyphSize: number;
}

function IconFallback({ emoji, systemIcon, glyphSize }: FallbackProps) {
  return <AppIcon icon={systemIcon} emoji={emoji} size={glyphSize} />;
}

function ImageLayer({
  src,
  fallback,
}: {
  src: string;
  fallback: React.ReactNode;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  if (status === 'failed') return <>{fallback}</>;

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
        onError={() => setStatus('failed')}
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
}: PageIconProps) {
  const dimensions = SIZE_TOKENS[size];
  const fallback = (
    <IconFallback emoji={emoji} systemIcon={systemIcon} glyphSize={dimensions.glyph} />
  );
  const src = imageSrc?.trim() || null;
  const style = {
    '--page-icon-slot-size': `${dimensions.slot}px`,
    '--page-icon-glyph-size': `${dimensions.glyph}px`,
  } as React.CSSProperties;

  return (
    <span className={`page-icon ${className ?? ''}`.trim()} style={style}>
      {src ? (
        <ImageLayer key={src} src={src} fallback={fallback} />
      ) : (
        <span className="page-icon__fallback">{fallback}</span>
      )}
    </span>
  );
}
