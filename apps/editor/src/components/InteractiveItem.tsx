import React from 'react';
import { Button } from './Button';
import { CustomIcons as Icons } from '../design-system/icons';

type InteractiveItemVariant =
  | 'navigation'
  | 'header'
  | 'subheader'
  | 'placeholder'
  | 'default';

type BaseProps = {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

type NavigationProps = BaseProps & {
  variant: 'navigation';
  icon?: React.ReactNode;
  isIconDisabled?: boolean;
};

type HeaderProps = BaseProps & {
  variant: 'header';
  isExpanded?: boolean;
  onExpandToggle?: () => void;
};

type SubheaderProps = {
  variant: 'subheader';
  children: React.ReactNode;
};

type PlaceholderProps = {
  variant: 'placeholder';
  children: React.ReactNode;
};

type DefaultProps = BaseProps & {
  variant: 'default';
  startSlot?: React.ReactNode;
  endSlot?: React.ReactNode;
  hasInlineSlot?: boolean;
  isInlineCaretDisabled?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
};

type InteractiveItemProps =
  | NavigationProps
  | HeaderProps
  | SubheaderProps
  | PlaceholderProps
  | DefaultProps;

export function InteractiveItem(props: InteractiveItemProps) {
  const { variant = 'default' } = props;
  const isNavigation = variant === 'navigation';
  const isHeader = variant === 'header';
  // const isSubheader = variant === 'subheader';
  // const isPlaceholder = variant === 'placeholder';
  const isDefault = variant === 'default';

  const isInteractive = isNavigation || isHeader || isDefault;

  // these exist in all variants
  const { children, className } = props;

  // interaction props
  const active = 'active' in props ? props.active : false;
  const disabled = 'disabled' in props ? props.disabled : false;
  const onClick = 'onClick' in props ? props.onClick : undefined;

  // Extract navigation-only props
  const icon = isNavigation ? props.icon : undefined;
  const isIconDisabled = isNavigation ? props.isIconDisabled : false;

  // Header-only props
  const headerIsExpanded = isHeader ? props.isExpanded : false;
  const onHeaderExpandToggle = isHeader ? props.onExpandToggle : undefined;

  // Default-only props
  const startSlot = isDefault ? props.startSlot : undefined;
  const endSlot = isDefault ? props.endSlot : undefined;
  const hasInlineSlot = isDefault ? props.hasInlineSlot : false;
  const isInlineCaretDisabled = isDefault ? props.isInlineCaretDisabled : false;
  const defaultIsExpanded = isDefault ? props.isExpanded : false;
  const onDefaultExpandToggle = isDefault ? props.onExpandToggle : undefined;

  // add start slot booleans
  const showsNavigationIcon = isNavigation && icon;
  const showsInlineCaret = isDefault && hasInlineSlot;
  const showsStartSlot = showsNavigationIcon || showsInlineCaret || startSlot;

  // add end slot booleans
  const showsHeaderChevron = isHeader;
  const showsEndSlot = showsHeaderChevron || endSlot;

  // create inline caret placeholder
  const inlineCaret = (
    <button
      type="button"
      disabled={disabled || isInlineCaretDisabled}
      className="interactive-item__inline-caret-trigger"
      onClick={(event) => {
        event.stopPropagation();
        onDefaultExpandToggle?.();
      }}
    >
      <span
        className={[
          'interactive-item__inline-caret',
          defaultIsExpanded && 'interactive-item__inline-caret--expanded',
          isInlineCaretDisabled && 'interactive-item__inline-caret--disabled',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </button>
  );

  // create header chevron placeholder
  const headerChevron = (
    <div
      className={[
        'interactive-item__header-chevron',
        headerIsExpanded && 'interactive-item__header-chevron--expanded',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Button
        variant="ghost"
        size="small"
        iconOnly={Icons.ChevronDown}
        onClick={(event) => {
          event.stopPropagation();

          if (disabled) {
            return;
          }
          onHeaderExpandToggle?.();
        }}
      ></Button>
    </div>
  );

  const itemClassName = [
    'interactive-item',
    `interactive-item--${variant}`,

    isInteractive && 'interactive-item--interactive',

    active && 'interactive-item--active',

    disabled && 'interactive-item--disabled',

    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={itemClassName} onClick={disabled ? undefined : onClick}>
      {showsStartSlot && (
        <div className="interactive-item__start-slot">
          {showsInlineCaret && inlineCaret}

          {showsNavigationIcon && (
            <div
              className={
                isIconDisabled
                  ? 'interactive-item__icon interactive-item__icon--disabled'
                  : 'interactive-item__icon'
              }
            >
              {icon}
            </div>
          )}

          {startSlot}
        </div>
      )}

      <div className="interactive-item__content-slot">{children}</div>
      {showsEndSlot && (
        <div className="interactive-item__end-slot">
          {showsHeaderChevron && headerChevron}

          {endSlot}
        </div>
      )}
    </div>
  );
}
