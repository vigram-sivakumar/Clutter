import { forwardRef, type HTMLAttributes } from 'react';

import './CollectionCard.css';

export interface CollectionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  isSelected?: boolean;
  /** Drops the fixed card shape: the card is only as tall as its content. */
  compact?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * The interactive shell every collection card shares: one open-the-item target
 * (`role="button"`, focusable, Enter/Space on the card itself — never on a
 * descendant — dispatching a real click, the same pattern CollectionEntry uses
 * for a row), the card surface/border/padding/gap, and the fixed card shape.
 * Collection-specific cards (NoteCard, AssetCard) compose it with their own
 * sections; nothing about notes or assets lives here.
 */
export const CollectionCard = forwardRef<HTMLDivElement, CollectionCardProps>(
  function CollectionCard(
    { isSelected = false, compact = false, onClick, className, children, ...props },
    ref
  ) {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      if (event.target !== event.currentTarget) {
        return;
      }
      event.preventDefault();
      event.currentTarget.click();
    };

    return (
      <div
        {...props}
        ref={ref}
        className={[
          'collection-card',
          compact && 'collection-card--compact',
          isSelected && 'collection-card--selected',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    );
  }
);

CollectionCard.displayName = 'CollectionCard';
