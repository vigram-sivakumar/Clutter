import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './CollectionEntry.css';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { Checkbox } from '@components/checkbox/Checkbox';

export interface CollectionEntryProps extends HTMLAttributes<HTMLDivElement> {
  icon?: SystemIcon;
  emoji?: string;

  title?: string;
  description?: string;
  metadata?: ReactNode;
  /**
   * Hover-gated trailing slot, mirroring Entry's own `.entry__actions`
   * (same opacity/visibility/pointer-events reveal pattern, in
   * CollectionEntry.css) — added for Archive's Restore/Delete row actions,
   * which have no other slot on this component. Omitted (the default)
   * renders exactly the same row every existing caller already gets.
   */
  actions?: ReactNode;

  isSelected?: boolean;

  isSelectable?: boolean;
  onSelectedChange?: (selected: boolean) => void;

  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export const CollectionEntry = forwardRef<HTMLDivElement, CollectionEntryProps>(
  function CollectionEntry(
    {
      icon,
      emoji,
      title,
      description,
      metadata,
      actions,
      isSelectable = false,
      isSelected = false,
      onSelectedChange,
      onClick,
      className,
      role,
      tabIndex,
      ...props
    },
    ref
  ) {
    // Mirrors Entry.tsx's own handleClick exactly — without this, a click
    // on a nested interactive element (the `actions` slot's Restore/Delete
    // buttons) would both fire its own onClick *and* bubble up to fire the
    // row's onClick (navigate/open), a real double-fire bug that stayed
    // latent while `actions` had no consumer.
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const interactiveElement = target.closest(
        'button, a, input, select, textarea, [role="button"]'
      );

      if (interactiveElement && interactiveElement !== event.currentTarget) {
        return;
      }

      onClick?.(event);
    };

    // A role="button" <div> has no native Enter/Space activation the way a
    // real <button> does — mirrors Entry.tsx's own handleKeyDown exactly
    // (same target !== currentTarget guard, same native-click dispatch),
    // so keyboard activation goes through the same path as a mouse click
    // instead of a second, parallel implementation of it.
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
          'collection-entry',
          className,
          onClick && 'collection-entry--interactive',
          isSelectable && 'collection-entry--selectable',
          isSelected && 'collection-entry--selected',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={onClick ? handleClick : undefined}
        onKeyDown={onClick ? handleKeyDown : undefined}
        role={role ?? (onClick ? 'button' : undefined)}
        tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
      >
        {(icon || emoji || isSelectable) && (
          <div className="collection-entry__leading">
            {(icon || emoji) && (
              <AppIcon
                className={
                  emoji ? 'collection-entry__emoji' : 'collection-entry__icon'
                }
                icon={icon}
                emoji={emoji}
              />
            )}

            {isSelectable && (
              <Checkbox
                isChecked={isSelected}
                onCheckedChange={onSelectedChange}
              />
            )}
          </div>
        )}

        <div className="collection-entry__content">
          <div className="collection-entry__primary">
            {title && <div className="collection-entry__title">{title}</div>}

            {description && (
              <div className="collection-entry__description">{description}</div>
            )}
          </div>

          {metadata && (
            <div className="collection-entry__metadata">{metadata}</div>
          )}
        </div>

        {actions && <div className="collection-entry__actions">{actions}</div>}
      </div>
    );
  }
);

CollectionEntry.displayName = 'CollectionEntry';
