import type { CSSProperties, ReactNode } from 'react';
import { AppIcon, type SystemIcon } from '@shared/icon';
import './CardTitleSection.css';

export interface CardTitleSectionProps {
  icon?: SystemIcon;
  /** Drawn instead of `icon` when set. */
  emoji?: string;

  title?: string;
  /** Replaces the plain-text `title` (an inline rename editor, most commonly); the title row is unchanged. */
  titleContent?: ReactNode;

  /** One truncated line, between the title and the metadata. */
  description?: string;

  /** One plain string per item ("Created 2 Sept, 15:30"). Each truncates on its own. */
  metadata?: readonly string[];
  /** `horizontal`: items on one line; `vertical`: one item per line. */
  metadataLayout?: 'horizontal' | 'vertical';
  /**
   * Reserves room for at least this many metadata lines even when there are fewer (or none), so
   * cards whose headers carry different amounts of metadata still come out the same height.
   */
  minMetadataLines?: number;

  className?: string;
}

/**
 * A card's header text: leading icon or emoji and the title, then an optional
 * description and metadata. A generic visual header — it knows nothing about
 * what the card is. It has no padding (the card provides it), and a part that
 * isn't supplied renders nothing.
 */
export function CardTitleSection({
  icon,
  emoji,
  title,
  titleContent,
  description,
  metadata,
  metadataLayout = 'horizontal',
  minMetadataLines = 0,
  className,
}: CardTitleSectionProps) {
  const hasTitle = titleContent !== undefined || Boolean(title);
  const hasLeading = Boolean(icon || emoji);
  const items = metadata ?? [];
  const reservesMetadata = items.length > 0 || minMetadataLines > 0;

  return (
    <div
      className={['card-title-section', className].filter(Boolean).join(' ')}
    >
      {(hasLeading || hasTitle) && (
        <div className="card-title-section__heading">
          {hasLeading && (
            <span className="card-title-section__leading">
              <AppIcon icon={icon} emoji={emoji} />
            </span>
          )}
          {hasTitle && <div className="card-title-section__title">{titleContent ?? title}</div>}
        </div>
      )}

      {description && <div className="card-title-section__description">{description}</div>}

      {reservesMetadata && (
        <div
          className={['card-title-section__metadata', `card-title-section__metadata--${metadataLayout}`].join(' ')}
          style={{ '--card-title-section-min-lines': minMetadataLines } as CSSProperties}
        >
          {items.map((item, index) => (
            <span key={`${index}:${item}`} className="card-title-section__metadata-item">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
