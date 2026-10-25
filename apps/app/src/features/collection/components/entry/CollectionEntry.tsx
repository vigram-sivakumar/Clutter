import {
  forwardRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { buildActivationProps } from '@shared/interaction';
import { CollectionSelectionCheckbox, selectionCaptureProps, withSelectionToggle, type CollectionItemSelection } from './CollectionSelectionCheckbox';
import './CollectionEntry.css';

/**
 * SLOT RULE — read before changing or wiring this component:
 *  - `leading`     whatever sits before the title (icon / emoji via AppIcon, a thumbnail, a checkbox).
 *  - `title`       the name.
 *  - `description` a real description, or a folder's contents line ("1 subfolder · 1 note"). Nothing else.
 *  - `trailing`    EVERYTHING else: dates, sizes, a type label, a thumbnail, a due-date control,
 *                  custom nodes — any number of them.
 * There are deliberately no `metadata` or `media` props.
 */
export interface CollectionEntryProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'title' | 'onClick'
> {
  layout?: 'list' | 'cell';
  leading?: ReactNode;
  /**
   * Makes the entry selectable: a checkbox takes the leading slot's place while the entry is hovered or focused (a
   * list row, a folder card) or its table row is (a name cell), and stays while it is checked — or, in selection mode, always — the same box, so
   * nothing shifts. Absent, the entry has no checkbox. Needs a `leading` to take the place of.
   */
  selection?: CollectionItemSelection;
  title: string;
  /** Replaces the plain-text title (an inline rename editor, a task's compact-markdown title). */
  titleContent?: ReactNode;
  description?: ReactNode;
  /**
   * Drawn right after the body (title + description), as its SIBLING in the entry's main row — never inside the body
   * or the title. The host supplies the `collection-entry__actions` element itself (Edit, a date picker…); see TaskTitleActions.
   */
  actions?: ReactNode;
  trailing?: ReactNode;
  isSelected?: boolean;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export const CollectionEntry = forwardRef<HTMLDivElement, CollectionEntryProps>(
  function CollectionEntry(
    {
      layout = 'list',
      leading,
      selection,
      title,
      titleContent,
      description,
      actions,
      trailing,
      isSelected = false,
      onClick,
      className,
      role,
      tabIndex,
      ...props
    },
    ref
  ) {
    return (
      <div
        {...props}
        {...buildActivationProps<HTMLDivElement>({
          onActivate: withSelectionToggle(selection, onClick),
          role,
          tabIndex,
        })}
        {...selectionCaptureProps(selection, onClick !== undefined)}
        ref={ref}
        data-selection-id={selection?.id}
        className={[
          'collection-entry',
          `collection-entry--layout-${layout}`,
          isSelected && 'collection-entry--selected',
          selection?.checked && 'collection-entry--checked',
          selection?.active && 'collection-entry--selecting',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="collection-entry__main">
          {(leading || titleContent || title) && (
            <div className="collection-entry__body">
              <div className="collection-entry__heading">
                {leading && (
                  <div className={['collection-entry__leading', selection && 'collection-entry__leading--swap'].filter(Boolean).join(' ')}>
                    {selection ? (
                      <>
                        <span className="collection-entry__leading-rest">
                          {leading}
                        </span>
                        <span className="collection-entry__leading-hover">
                          <CollectionSelectionCheckbox selection={selection} />
                        </span>
                      </>
                    ) : (
                      leading
                    )}
                  </div>
                )}
                {(titleContent || title) && (
                  <div className="collection-entry__title">
                    {titleContent ?? title}
                  </div>
                )}
              </div>

              {description && (
                <div className="collection-entry__description">
                  {description}
                </div>
              )}
            </div>
          )}
          {actions}
        </div>
        {trailing && (
          <div className="collection-entry__trailing">{trailing}</div>
        )}
      </div>
    );
  }
);
