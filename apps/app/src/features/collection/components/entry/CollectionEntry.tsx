import {
  forwardRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { buildActivationProps } from '@shared/interaction';
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
  title: string;
  /** Replaces the plain-text title (an inline rename editor, a task's compact-markdown title). */
  titleContent?: ReactNode;
  description?: string;
  /**
   * Drawn right after the title, as its SIBLING inside the content — never inside the title. The host supplies the
   * `collection-entry__actions` element itself (Edit, a date picker…); see TaskTitleActions.
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
        {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
        ref={ref}
        className={[
          'collection-entry',
          `collection-entry--layout-${layout}`,
          isSelected && 'collection-entry--selected',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {leading && <div className="collection-entry__leading">{leading}</div>}
        <div className="collection-entry__content">
          <div className="collection-entry__title">{titleContent ?? title}</div>
          {actions}
          {description && (
            <div className="collection-entry__description">{description}</div>
          )}
        </div>
        {trailing && (
          <div className="collection-entry__trailing">{trailing}</div>
        )}
      </div>
    );
  }
);
