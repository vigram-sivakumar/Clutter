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
   * Nesting depth under an expanded caret parent (0 = top-level in a group).
   * Each level adds `--space-16` (16px) to row padding-left via CSS.
   */
  indentDepth?: number;
  /**
   * Leading region layout: 'slot' = empty alignment slot (for leaf items),
   * 'caret' = expand/collapse caret (for tree parents), 'none' = no leading region.
   * Default: 'none'.
   */
  leadingMode?: 'none' | 'slot' | 'caret';
  /**
   * Only applies when leadingMode='caret'. When true, hides the expand button
   * (parent has no children). Caret icon still shown but disabled. Default: false.
   */
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
      const leadingMode = props.leadingMode ?? 'none';
      const hasChildren = props.hasChildren ?? true;

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
        hasInlineSlot: leadingMode === 'slot',
        hasInlineCaret: leadingMode === 'caret',
        inlineCaretDisabled: leadingMode === 'caret' && !hasChildren,
        defaultIsExpanded: props.isExpanded ?? false,
        onDefaultExpandToggle: props.onExpandToggle,
      };
    }
  }
}

/**
 * Row-layout primitive for interactive sidebar items, tree nodes, and list entries.
 *
 * InteractiveItem owns the layout structure, interaction states (hover, active, focus,
 * disabled), and alignment. Consumers own the content structure and styling.
 *
 * ──────── Layout Structure ────────────────────────────────────────────────────────
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ leading region  │ start slot │  content slot (children)  │  end slot        │
 * │ (caret/indent)  │ (icon)     │  (label, pill, etc.)     │  (badge, menu)   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ──────── Composition Model ────────────────────────────────────────────────────
 *
 * Variant 'default': Flexible content rows with optional leading expand caret.
 *   - leadingMode?: 'none' | 'slot' | 'caret'
 *     * 'none' (default) — no leading region
 *     * 'slot' — empty leading alignment column (for leaf items in a tree)
 *     * 'caret' — expand/collapse caret + button (for tree parents)
 *
 *   - startSlot?: ReactNode — leading icon, checkbox, avatar, etc. Centers in 20px slot.
 *   - children — freeform content (you own styling). Apply published class names:
 *     * `.interactive-item__label` — single-line label with truncation
 *     * `.interactive-item__label--completed` — strikethrough + muted color (tasks)
 *     * `.interactive-item__icon` — centered icon inheriting text color
 *
 *   - endSlot?: ReactNode — trailing badge, count, menu button, etc. Centers in 20px slot.
 *   - hasChildren?: boolean — only applies when leadingMode='caret'. When false,
 *     caret icon shown but disabled (no expand button). Default: true.
 *   - isExpanded?: boolean — caret rotation state (when leadingMode='caret').
 *   - onExpandToggle?: () => void — fired when caret button clicked.
 *   - indentDepth?: number — nesting level. Each adds 16px left padding.
 *
 * Variant 'header': Section or group header with optional expand chevron.
 *   - onExpandToggle?: () => void — shows chevron; chevron rotation controlled by isExpanded.
 *   - isExpanded?: boolean — chevron rotation state.
 *   - active?: boolean — highlight this header as selected (does not toggle expand).
 *   - interactive?: boolean — show hover/active states. Default: true if onClick or onExpandToggle set.
 *
 * Variant 'subheader': Date group label or section divider (no interaction).
 *
 * Variant 'placeholder': Empty state message (no interaction).
 *
 * ──────── Example: Task Tree ────────────────────────────────────────────────
 *
 * <InteractiveItem
 *   variant="default"
 *   leadingMode="caret"
 *   hasChildren={subtasks.length > 0}
 *   isExpanded={expanded}
 *   onExpandToggle={() => toggle()}
 *   startSlot={<Checkbox checked={done} onChange={...} />}
 *   onClick={() => select()}
 *   active={isSelected}
 * >
 *   <span className="interactive-item__label">Task title</span>
 * </InteractiveItem>
 */
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
