import type { HTMLAttributes, ReactNode } from 'react';

import { AppIcon, type SystemIcon } from '@shared/icon';

import './CardTitleSection.css';

const join = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

export interface CardTitleProps extends HTMLAttributes<HTMLDivElement> {}

/** The card's one-line, truncating title. */
export function CardTitle({ className, ...props }: CardTitleProps) {
  return <div {...props} className={join('card-title', className)} />;
}

export interface CardMetadataProps extends HTMLAttributes<HTMLDivElement> {
  /** `horizontal`: items on one line, `Item · Item`-style; `vertical`: one item per line. Each item truncates on its own. */
  layout?: 'horizontal' | 'vertical';
}

/** The card's metadata items (counts, dates, …) — the caller passes one element per item. */
export function CardMetadata({ layout = 'horizontal', className, ...props }: CardMetadataProps) {
  return <div {...props} className={join('card-metadata', `card-metadata--${layout}`, className)} />;
}

export interface CardDescriptionProps extends HTMLAttributes<HTMLDivElement> {}

/** The card's one-line, truncating description. */
export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return <div {...props} className={join('card-description', className)} />;
}

export interface CardTitleSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: string;
  /** Replaces the plain-text `title` (an inline rename editor, most commonly); the title row is unchanged. */
  titleContent?: ReactNode;
  /** Leading glyph, in a fixed box before the title. */
  icon?: SystemIcon;
  emoji?: string;
  /** Replaces the icon/emoji box entirely (FolderCard's selection checkbox). */
  leading?: ReactNode;
  /** Metadata items; omit (or pass nothing) for no metadata row. */
  metadata?: ReactNode;
  metadataLayout?: 'horizontal' | 'vertical';
  /** One truncated line, shown above the metadata. Omit for none. */
  description?: string;
}

/**
 * The title block every collection card shares — leading glyph + title, then
 * an optional description and metadata. Domain-agnostic: it knows nothing about
 * notes, assets or folders, only about how a card's text is laid out and
 * styled. It owns no padding (the card does); a slot that isn't supplied
 * renders nothing, so a bare title is just the title row.
 */
export function CardTitleSection({
  title,
  titleContent,
  icon,
  emoji,
  leading,
  metadata,
  metadataLayout = 'horizontal',
  description,
  className,
  ...props
}: CardTitleSectionProps) {
  const hasTitle = titleContent !== undefined || Boolean(title);
  const leadingNode =
    leading ??
    ((icon || emoji) && (
      <div className="card-title-section__leading">
        <AppIcon
          className={emoji ? 'card-title-section__emoji' : 'card-title-section__icon'}
          icon={icon}
          emoji={emoji}
        />
      </div>
    ));

  return (
    <div {...props} className={join('card-title-section', className)}>
      <div className="card-title-section__heading">
        {leadingNode}
        {hasTitle && <CardTitle>{titleContent ?? title}</CardTitle>}
      </div>
      {description && <CardDescription>{description}</CardDescription>}
      {metadata && <CardMetadata layout={metadataLayout}>{metadata}</CardMetadata>}
    </div>
  );
}
