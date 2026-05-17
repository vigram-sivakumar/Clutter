import '../styles/interactive-item.css';

import React from 'react';
import { Button } from './Button';
import { CustomIcons as Icons, ICON_SMALL } from '../design-system/icons';

type BaseProps = {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

type HeaderProps = BaseProps & {
  variant: 'header';
  /** Chevron rotation only; does not imply active/selected. */
  isExpanded?: boolean;
  /** Chevron only: expand/collapse. Chevron shown when this is set. */
  onExpandToggle?: () => void;
  /**
   * When false, no hover or pointer cursor on the row.
   * Default: true when onClick or onExpandToggle is set.
   */
  interactive?: boolean;
};

type SubheaderProps = {
  variant: 'subheader';
  children: React.ReactNode;
  className?: string;
};

type PlaceholderProps = {
  variant: 'placeholder';
  children: React.ReactNode;
  className?: string;
};

type DefaultProps = BaseProps & {
  variant: 'default';
  startSlot?: React.ReactNode;
  endSlot?: React.ReactNode;
  /**
   * Nesting depth under an expanded `hasInlineCaret` parent (0 = top-level in a group).
   * Each level adds `--space-16` (16px) to row padding-left via CSS.
   */
  indentDepth?: number;
  /**
   * Alignment-only leading column (no caret). Use for leaf notes.
   * Do not combine with hasInlineCaret — caret implies the slot.
   */
  hasInlineSlot?: boolean;
  /** Folder rows: leading slot + caret. hasChildren only applies when this is set. */
  hasInlineCaret?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
};

type InteractiveItemProps =
  | HeaderProps
  | SubheaderProps
  | PlaceholderProps
  | DefaultProps;

type ItemLayout = {
  variant: InteractiveItemProps['variant'];
  children: React.ReactNode;
  className?: string;
  isInteractive: boolean;
  active: boolean;
  disabled: boolean;
  onClick?: () => void;
  headerIsExpanded: boolean;
  onHeaderExpandToggle?: () => void;
  showHeaderChevron: boolean;
  startSlot?: React.ReactNode;
  endSlot?: React.ReactNode;
  hasInlineSlot: boolean;
  hasInlineCaret: boolean;
  inlineCaretDisabled: boolean;
  defaultIsExpanded: boolean;
  onDefaultExpandToggle?: () => void;
};

function getItemLayout(props: InteractiveItemProps): ItemLayout {
  switch (props.variant) {
    case 'header': {
      const headerInteractive =
        props.interactive ?? (!!props.onClick || !!props.onExpandToggle);

      return {
        variant: 'header',
        children: props.children,
        className: props.className,
        isInteractive: headerInteractive,
        active: props.active ?? false,
        disabled: props.disabled ?? false,
        onClick: props.onClick,
        headerIsExpanded: props.isExpanded ?? false,
        onHeaderExpandToggle: props.onExpandToggle,
        showHeaderChevron: !!props.onExpandToggle,
        startSlot: undefined,
        endSlot: undefined,
        hasInlineSlot: false,
        hasInlineCaret: false,
        inlineCaretDisabled: false,
        defaultIsExpanded: false,
        onDefaultExpandToggle: undefined,
      };
    }
    case 'subheader':
      return {
        variant: 'subheader',
        children: props.children,
        className: props.className,
        isInteractive: false,
        active: false,
        disabled: false,
        onClick: undefined,
        headerIsExpanded: false,
        onHeaderExpandToggle: undefined,
        showHeaderChevron: false,
        startSlot: undefined,
        endSlot: undefined,
        hasInlineSlot: false,
        hasInlineCaret: false,
        inlineCaretDisabled: false,
        defaultIsExpanded: false,
        onDefaultExpandToggle: undefined,
      };
    case 'placeholder':
      return {
        variant: 'placeholder',
        children: props.children,
        className: props.className,
        isInteractive: false,
        active: false,
        disabled: false,
        onClick: undefined,
        headerIsExpanded: false,
        onHeaderExpandToggle: undefined,
        showHeaderChevron: false,
        startSlot: undefined,
        endSlot: undefined,
        hasInlineSlot: false,
        hasInlineCaret: false,
        inlineCaretDisabled: false,
        defaultIsExpanded: false,
        onDefaultExpandToggle: undefined,
      };
    case 'default': {
      const hasInlineSlot = props.hasInlineSlot ?? false;
      const hasInlineCaret = props.hasInlineCaret ?? false;
      const hasChildren = props.hasChildren ?? false;

      return {
        variant: 'default',
        children: props.children,
        className: props.className,
        isInteractive: !!props.onClick,
        active: props.active ?? false,
        disabled: props.disabled ?? false,
        onClick: props.onClick,
        headerIsExpanded: false,
        onHeaderExpandToggle: undefined,
        showHeaderChevron: false,
        startSlot: props.startSlot,
        endSlot: props.endSlot,
        hasInlineSlot,
        hasInlineCaret,
        inlineCaretDisabled: hasInlineCaret && !hasChildren,
        defaultIsExpanded: props.isExpanded ?? false,
        onDefaultExpandToggle: props.onExpandToggle,
      };
    }
  }
}

export function InteractiveItem(props: InteractiveItemProps) {
  const indentDepth =
    props.variant === 'default' ? (props.indentDepth ?? 0) : 0;

  const {
    variant,
    children,
    className,
    isInteractive,
    active,
    disabled,
    onClick,
    headerIsExpanded,
    onHeaderExpandToggle,
    showHeaderChevron: showsHeaderChevron,
    startSlot,
    endSlot,
    hasInlineSlot,
    hasInlineCaret,
    inlineCaretDisabled,
    defaultIsExpanded,
    onDefaultExpandToggle,
  } = getItemLayout(props);

  const itemStyle =
    variant === 'default' && indentDepth > 0
      ? ({
          '--interactive-item-indent-depth': indentDepth,
        } as React.CSSProperties)
      : undefined;

  const showsInlineCaret = variant === 'default' && hasInlineCaret;
  const showsEmptyInlineSlot =
    variant === 'default' && hasInlineSlot && !hasInlineCaret;
  const showsInlineExpandButton =
    showsInlineCaret &&
    !inlineCaretDisabled &&
    onDefaultExpandToggle !== undefined;
  const showsInlineCaretDisabled = showsInlineCaret && inlineCaretDisabled;
  const showsIconSlot = !!startSlot;
  const showsLeading = showsEmptyInlineSlot || showsInlineCaret || showsIconSlot;
  const showsEndSlot = showsHeaderChevron || endSlot;

  const emptyInlineSlot = (
    <span className="interactive-item__inline-caret-slot" />
  );

  const inlineCaretSlot = (
    <span
      className={[
        'interactive-item__inline-caret-slot',
        showsInlineCaretDisabled &&
          'interactive-item__inline-caret-slot--disabled',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showsInlineExpandButton && (
        <button
          type="button"
          disabled={disabled}
          className="interactive-item__inline-caret-wrapper"
          onClick={(event) => {
            event.stopPropagation();
            onDefaultExpandToggle?.();
          }}
        >
          <span
            className={[
              'interactive-item__inline-caret',
              defaultIsExpanded && 'interactive-item__inline-caret--expanded',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Icons.CaretRight size={ICON_SMALL} />
          </span>
        </button>
      )}

      {showsInlineCaretDisabled && (
        <span className="interactive-item__inline-caret" aria-hidden>
          <Icons.CaretRight size={ICON_SMALL} />
        </span>
      )}
    </span>
  );

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
        size="xsmall"
        iconOnly={Icons.ChevronRight}
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
    <div
      className={itemClassName}
      style={itemStyle}
      onClick={disabled ? undefined : onClick}
    >
      {showsLeading && (
        <div className="interactive-item__leading">
          {showsEmptyInlineSlot && emptyInlineSlot}
          {showsInlineCaret && inlineCaretSlot}

          {showsIconSlot && (
            <div className="interactive-item__start-slot">{startSlot}</div>
          )}
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
