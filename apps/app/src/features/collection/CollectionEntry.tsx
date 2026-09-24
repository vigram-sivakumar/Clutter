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
        onClick={onClick}
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
      </div>
    );
  }
);

CollectionEntry.displayName = 'CollectionEntry';
