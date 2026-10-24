import { forwardRef, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { buildActivationProps } from '@shared/interaction';
import '../collectionTokens.css';
import './CollectionCard.css';

export interface CollectionCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title' | 'onClick'> {
  /** A banner across the very top of the card, edge to edge (an image, normally), cropped to its height. */
  media?: ReactNode;
  /** A section above the content, at real size — normally a CardTitleSection, but the card does not know or care. */
  header?: ReactNode;
  /** A rule between the header and the content — normally a CardDivider; drawn only when the card has both. */
  divider?: ReactNode;
  /** The main content. It fills whatever height the media and header leave, and runs to the card's bottom edge. */
  children?: ReactNode;

  /** How tall the media is — a CSS length (`'100%'` for the whole card, leaving the header what it needs). Default 66px. */
  mediaHeight?: string | number;
  /** `false` hides the content, and with it the divider. Default true. */
  showContent?: boolean;
  /** `false` hides the divider even when one is given. Default true. */
  showDivider?: boolean;

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
 * two top-level parts, arranged in normal flow (nothing is positioned over
 * anything else): the media, a banner flush with the card's top and sides; and
 * the main section, which holds the header, the divider and the content. The
 * main section pads itself on every side and spaces its children with one gap;
 * when it holds content it drops its bottom padding, so the content runs to the
 * card's edge. Every part is optional and the card never looks inside any of
 * them. What a card shows is the caller's content; what it does when clicked is
 * the caller's `onClick`, wired through the shared activation behavior (nested
 * controls keep their own clicks).
 */
export const CollectionCard = forwardRef<HTMLDivElement, CollectionCardProps>(function CollectionCard(
  {
    media,
    header,
    divider,
    children,
    mediaHeight,
    showContent = true,
    showDivider = true,
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
  const cardStyle: CSSProperties = {
    ...(aspectRatio !== undefined && { aspectRatio: String(aspectRatio) }),
    ...(mediaHeight !== undefined && { '--collection-card-media-height': mediaHeight }),
    ...style,
  } as CSSProperties;

  const hasContent = showContent && Boolean(children);

  return (
    <div
      {...props}
      {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
      ref={ref}
      className={[
        'collection-card',
        isSelected && 'collection-card--selected',
        isEmpty && 'collection-card--empty',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={cardStyle}
    >
      {media && <div className="collection-card__media">{media}</div>}
      {(header || hasContent) && (
        <div className={['collection-card__main', hasContent && 'collection-card__main--content'].filter(Boolean).join(' ')}>
          {header && <div className="collection-card__header">{header}</div>}
          {header && hasContent && showDivider && divider}
          {hasContent && <div className="collection-card__content">{children}</div>}
        </div>
      )}
    </div>
  );
});

CollectionCard.displayName = 'CollectionCard';
