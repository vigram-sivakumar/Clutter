import { forwardRef, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { buildActivationProps } from '@shared/interaction';
import '../collectionTokens.css';
import './CollectionCard.css';

export interface CollectionCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title' | 'onClick'> {
  /** The card's heading — normally a CardTitleSection, but the card does not know or care. */
  header?: ReactNode;
  /** `stack`: a banner between the header and the content. `overlay`: fills the whole card, behind the header. */
  media?: ReactNode;
  /** The main content. In `stack` it fills whatever height the header and media leave. */
  children?: ReactNode;

  /** `stack` (default): header, media, content in order. `overlay`: media fills the card, the header sits over its bottom edge. */
  layout?: 'stack' | 'overlay';

  /** The card's fixed shape: a width / height number, or a CSS ratio such as `'3 / 4'`. Omit and the card is as tall as its content. */
  aspectRatio?: number | string;

  isSelected?: boolean;

  /**
   * An empty slot-card (the "add something" card): a quieter surface, with its `children` centred
   * in the card — typically just a plus icon.
   */
  isEmpty?: boolean;

  /** Opens the card. Without it the card is inert: no role, not focusable, no key handling. */
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

/**
 * A bounded card surface — fill, border, radius, hover, selected, focus — with
 * three slots (header, media, children) it arranges but never looks
 * inside. What a card shows is the caller's content; what it does when
 * clicked is the caller's `onClick`, wired through the shared activation
 * behavior (nested controls keep their own clicks).
 */
export const CollectionCard = forwardRef<HTMLDivElement, CollectionCardProps>(function CollectionCard(
  {
    header,
    media,
    children,
    layout = 'stack',
    aspectRatio,
    isSelected = false,
    isEmpty = false,
    onClick,
    className,
    style,
    role,
    tabIndex,
    ...props
  },
  ref
) {
  const cardStyle: CSSProperties | undefined =
    aspectRatio === undefined ? style : { aspectRatio: String(aspectRatio), ...style };

  return (
    <div
      {...props}
      {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
      ref={ref}
      className={[
        'cx-collection-card',
        `cx-collection-card--layout-${layout}`,
        isSelected && 'cx-collection-card--selected',
        isEmpty && 'cx-collection-card--empty',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={cardStyle}
    >
      {layout === 'overlay' ? (
        <>
          {media && <div className="cx-collection-card__media">{media}</div>}
          {header && <div className="cx-collection-card__header">{header}</div>}
          {children && <div className="cx-collection-card__content">{children}</div>}
        </>
      ) : (
        <>
          {header && <div className="cx-collection-card__header">{header}</div>}
          {media && <div className="cx-collection-card__media">{media}</div>}
          {children && <div className="cx-collection-card__content">{children}</div>}
        </>
      )}
    </div>
  );
});

CollectionCard.displayName = 'CollectionCard';
