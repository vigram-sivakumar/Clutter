import type { CSSProperties, ReactNode } from 'react';
import { AppIcon, type SystemIcon } from '@shared/icon';
import './CardTitleSection.css';

export type CardMetadataItem = string | { readonly label: string; readonly value: string };

export interface CardTitleSectionProps {
  icon?: SystemIcon;
  /** Drawn instead of `icon` when set. */
  emoji?: string;

  title?: string;
  /** Replaces the plain-text `title` (an inline rename editor, most commonly); the title row is unchanged. */
  titleContent?: ReactNode;

  /** One truncated line, between the title and the metadata. */
  description?: string;

  /** One entry per item: a string, or a label with its value ("Size" "4 MB"). Each truncates on its own. */
  metadata?: readonly CardMetadataItem[];
  /** `horizontal`: items on one line; `vertical`: one item per line. */
  metadataLayout?: 'horizontal' | 'vertical';
  /**
   * How a `{ label, value }` item lays out: `inline` (default) puts the value right after the
   * label; `spread` puts the label at the start and the value at the end of the full width, the
   * value truncating first. Plain string items are unaffected.
   */
  metadataAlign?: 'inline' | 'spread';
  /**
   * Where the title row sits among the section's lines: `top` (default) is title, description,
   * metadata; `bottom` reverses the section so the title row is last, under the description
   * and metadata (each part keeps its own internal order).
   */
  titlePlacement?: 'top' | 'bottom';
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
 *
 * Customizable by its host through CSS custom properties it reads (all
 * optional): --card-title-color, --card-title-leading-color,
 * --card-description-color, --card-metadata-value-color.
 */
export function CardTitleSection({
  icon,
  emoji,
  title,
  titleContent,
  description,
  metadata,
  metadataLayout = 'horizontal',
  metadataAlign = 'inline',
  titlePlacement = 'top',
  minMetadataLines = 0,
  className,
}: CardTitleSectionProps) {
  const hasTitle = titleContent !== undefined || Boolean(title);
  const hasLeading = Boolean(icon || emoji);
  const items = metadata ?? [];
  const reservesMetadata = items.length > 0 || minMetadataLines > 0;

  return (
    <div
      className={[
        'card-title-section',
        titlePlacement === 'bottom' && 'card-title-section--title-bottom',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
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
          className={[
            'card-title-section__metadata',
            `card-title-section__metadata--${metadataLayout}`,
            metadataAlign === 'spread' && 'card-title-section__metadata--spread',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--card-title-section-min-lines': minMetadataLines } as CSSProperties}
        >
          {items.map((item, index) =>
            typeof item === 'string' ? (
              <span key={`${index}:${item}`} className="card-title-section__metadata-item">
                {item}
              </span>
            ) : (
              <span key={`${index}:${item.label}`} className="card-title-section__metadata-item">
                <span className="card-title-section__metadata-label">{item.label}</span>
                <span className="card-title-section__metadata-value">{item.value}</span>
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
