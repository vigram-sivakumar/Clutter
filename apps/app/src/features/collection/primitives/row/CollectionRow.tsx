import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { buildActivationProps } from '@shared/interaction';
import '../collectionTokens.css';
import './CollectionRow.css';

export interface CollectionRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onClick'> {
  /**
   * Where the row sits. `list`: a row of its own — title and description side by side, the
   * metadata and media trailing, its own hover. `cell`: a table's name cell — title over
   * description over metadata, no hover of its own (the table row has it); `media` is not drawn.
   */
  layout?: 'list' | 'cell';
  /** `action`: the quiet "create something" row (a muted title and icon). */
  tone?: 'default' | 'action';

  icon?: SystemIcon;
  /** Drawn instead of `icon` when set. */
  emoji?: string;
  /** Replaces the icon/emoji box entirely — a thumbnail (`CollectionMedia`), for one. */
  leading?: ReactNode;

  title?: string;
  /** Replaces the plain-text title (an inline rename editor, most commonly). */
  titleContent?: ReactNode;

  description?: string;
  /** Shown, muted, in the description's place when `description` is empty. Absent, an empty description draws nothing. */
  descriptionPlaceholder?: string;

  /** Trailing in `list`, under the description in `cell`. */
  metadata?: ReactNode;
  /** A thumbnail at the trailing end, after the metadata (`list` only). */
  media?: ReactNode;
  /** Revealed on hover/focus at the row's end. */
  actions?: ReactNode;

  isSelected?: boolean;

  /** Opens the row. Without it the row is inert: no role, not focusable, no key handling. */
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

/**
 * One generic row: leading icon or emoji, title, description, metadata, media
 * and hover-revealed actions. It draws a list row or a table's name cell and
 * knows nothing about what the row is. Opening goes through the shared
 * activation behavior, so a nested control (an actions button, a clickable
 * thumbnail) keeps its own click.
 */
export const CollectionRow = forwardRef<HTMLDivElement, CollectionRowProps>(function CollectionRow(
  {
    layout = 'list',
    tone = 'default',
    icon,
    emoji,
    leading,
    title,
    titleContent,
    description,
    descriptionPlaceholder,
    metadata,
    media,
    actions,
    isSelected = false,
    onClick,
    className,
    role,
    tabIndex,
    ...props
  },
  ref
) {
  const hasTitle = titleContent !== undefined || Boolean(title);
  const descriptionText = description || descriptionPlaceholder;
  const isPlaceholder = !description && descriptionPlaceholder !== undefined;
  const showsMedia = layout === 'list' && Boolean(media);
  const showsTrailing = layout === 'list' && (Boolean(metadata) || showsMedia);

  return (
    <div
      {...props}
      {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
      ref={ref}
      className={[
        'cx-collection-row',
        `cx-collection-row--layout-${layout}`,
        `cx-collection-row--tone-${tone}`,
        isSelected && 'cx-collection-row--selected',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {leading ? (
        <span className="cx-collection-row__leading cx-collection-row__leading--custom">{leading}</span>
      ) : (
        (icon || emoji) && (
          <span className="cx-collection-row__leading">
            <AppIcon icon={icon} emoji={emoji} />
          </span>
        )
      )}

      <div className="cx-collection-row__content">
        <div className="cx-collection-row__primary">
          {hasTitle && <div className="cx-collection-row__title">{titleContent ?? title}</div>}
          {descriptionText && (
            <div
              className={[
                'cx-collection-row__description',
                isPlaceholder && 'cx-collection-row__description--placeholder',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {descriptionText}
            </div>
          )}
        </div>

        {layout === 'cell' && metadata && <div className="cx-collection-row__metadata">{metadata}</div>}
        {showsTrailing && (
          <div className="cx-collection-row__trailing">
            {metadata && <div className="cx-collection-row__metadata">{metadata}</div>}
            {showsMedia && <div className="cx-collection-row__media">{media}</div>}
          </div>
        )}
      </div>

      {actions && <div className="cx-collection-row__actions">{actions}</div>}
    </div>
  );
});

CollectionRow.displayName = 'CollectionRow';
