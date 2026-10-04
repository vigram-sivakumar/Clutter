import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './CollectionEntry.css';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { Checkbox } from '@components/checkbox/Checkbox';
import { CardTitleSection } from './components/card/CardTitleSection';

export interface CollectionEntryProps extends HTMLAttributes<HTMLDivElement> {
  icon?: SystemIcon;
  emoji?: string;

  title?: string;
  /**
   * Replaces the plain-text `title` with arbitrary content — an inline editor
   * (rename), most commonly. The title row and its styling are unchanged; only
   * what's inside it differs. Absent, `title` renders exactly as before.
   */
  titleContent?: ReactNode;
  description?: string;
  descriptionClassName?: string;
  metadata?: ReactNode;
  /**
   * A thumbnail (`CollectionMedia`) shown at the row's trailing end — after the
   * title, description and `metadata` (the dates), before `actions` — the List
   * layout's media slot. Opt-in; absent, the row is exactly as before. The
   * thumbnail may be a button (its own click never opens the row, same
   * nested-button guard as `actions`).
   */
  media?: ReactNode;
  /**
   * Hover-gated trailing slot, mirroring Entry's own `.entry__actions`
   * (same opacity/visibility/pointer-events reveal pattern, in
   * CollectionEntry.css) — added for Archive's Restore/Delete row actions,
   * which have no other slot on this component. Omitted (the default)
   * renders exactly the same row every existing caller already gets.
   */
  actions?: ReactNode;

  /**
   * Card-style layout: row one is icon + title, `metadata` sits below it
   * spanning the full width (instead of the default icon | title+metadata
   * columns, or List/Table's trailing metadata). Rendered by the shared
   * CardTitleSection. Opt-in — used by FolderCard; every other caller renders
   * exactly as before.
   */
  stacked?: boolean;

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
      titleContent,
      description,
      descriptionClassName,
      metadata,
      media,
      actions,
      stacked = false,
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

    const leading =
      (icon || emoji || isSelectable) && (
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
        );

    const primary = (
      <div className="collection-entry__primary">
            {(titleContent !== undefined || title) && (
              <div className="collection-entry__title">{titleContent ?? title}</div>
            )}

            {description && (
              <div
                className={[
                  'collection-entry__description',
                  descriptionClassName,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {description}
              </div>
            )}
          </div>
    );

    return (
      <div
        {...props}
        ref={ref}
        className={[
          'collection-entry',
          className,
          onClick && 'collection-entry--interactive',
          stacked && 'collection-entry--stacked',
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
        {stacked ? (
          // The card header: the shared title section (components/card), so the
          // stacked layout has one implementation. Only the leading box (with
          // the selection checkbox) is this entry's own.
          <CardTitleSection
            className="collection-entry__content"
            leading={leading || undefined}
            title={title}
            titleContent={titleContent}
            description={description}
            metadata={metadata}
          />
        ) : (
          <>
            {leading}
            <div className="collection-entry__content">
              {primary}
            </div>
            {metadata && (
              <div className="collection-entry__metadata">{metadata}</div>
            )}
          </>
        )}

        {media && <div className="collection-entry__media">{media}</div>}

        {actions && <div className="collection-entry__actions">{actions}</div>}
      </div>
    );
  }
);

CollectionEntry.displayName = 'CollectionEntry';
