import type { HTMLAttributes } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

import { Button } from './Button';
import { Icons, ICON_MEDIUM } from '../design-system/icons';

export type EmptyStateType = 'page' | 'inline';

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  /** Full empty block vs single muted line (Figma `Type=Page` / `Type=Inline`). */
  type?: EmptyStateType;
  title?: string;
  description?: string;
  /** When `type="page"`, toggles the title text next to the icon. */
  showTitle?: boolean;
  /** When `type="page"`, toggles the action button row. */
  showActions?: boolean;
  showPrimaryAction?: boolean;
  showSecondaryAction?: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  /** Leading icon for the title row and primary action (Figma: circle outline). */
  icon?: PhosphorIcon;
};

const DefaultIcon = Icons.Circle;

/**
 * Empty state — sidepanel scroll region (Figma: Empty state, node 303:28705).
 * Page: icon + title, description, optional two secondary-style actions.
 * Inline: one tertiary description line only.
 */
export function EmptyState({
  type = 'page',
  title = 'Title',
  description = 'Empty state description',
  showTitle = true,
  showActions = true,
  showPrimaryAction = true,
  showSecondaryAction = false,
  primaryActionLabel = 'Label',
  secondaryActionLabel = 'Label',
  onPrimaryAction,
  onSecondaryAction,
  icon: IconProp,
  className,
  ...props
}: EmptyStateProps) {
  const Icon = IconProp ?? DefaultIcon;
  const rootCls = [
    'clutter-empty-state',
    type === 'page' ? 'clutter-empty-state--page' : 'clutter-empty-state--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (type === 'inline') {
    return (
      <div className={rootCls} {...props}>
        <p className="clutter-empty-state__description clutter-empty-state__description--inline">
          {description}
        </p>
      </div>
    );
  }

  return (
    <div className={rootCls} {...props}>
      <div className="clutter-empty-state__content">
        <div className="clutter-empty-state__head">
          <span className="clutter-empty-state__icon" aria-hidden>
            <Icon size={ICON_MEDIUM} weight="regular" />
          </span>
          {showTitle ? (
            <p className="clutter-empty-state__title">{title}</p>
          ) : null}
        </div>
        <p className="clutter-empty-state__description">{description}</p>
      </div>
      {showActions && (showPrimaryAction || showSecondaryAction) ? (
        <div className="clutter-empty-state__actions">
          {showSecondaryAction ? (
            <Button
              type="button"
              variant="secondary"
              iconLeft={Icon}
              className="clutter-empty-state__action"
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </Button>
          ) : null}
          {showPrimaryAction ? (
            <Button
              type="button"
              variant="secondary"
              iconLeft={Icon}
              className="clutter-empty-state__action"
              onClick={onPrimaryAction}
            >
              {primaryActionLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
