import React from 'react';
import {
  CustomIcons,
  ICON_MEDIUM,
  ICON_SMALL,
  type ClutterIcon,
} from '../design-system/icons';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'small' | 'xsmall';
export type ButtonContentAlign = 'center' | 'start' | 'end';

/** Put on the text node inside a `Button` with `ellipsis` so it shrinks and ellipsizes. */
export const BUTTON_ELLIPSIS_TARGET_CLASS = 'clutter-btn__ellipsis-target';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  border?: boolean;
  iconOnly?: ClutterIcon;
  iconLeft?: ClutterIcon;
  iconRight?: ClutterIcon;
  caret?: boolean;
  /** Row alignment inside the button (ignored for `iconOnly`). Default `center`. */
  contentAlign?: ButtonContentAlign;
  /**
   * When true (not `iconOnly`), `.clutter-btn__content` can shrink for truncation.
   * Mark the truncating label with {@link BUTTON_ELLIPSIS_TARGET_CLASS}. Default `true`.
   * Set `false` for a plain inline row without width stretch / ellipsis plumbing.
   */
  ellipsis?: boolean;
}

const ICON_SIZE = ICON_MEDIUM;

export function Button({
  variant = 'secondary',
  size = 'default',
  active = false,
  border = false,
  iconOnly,
  iconLeft,
  iconRight,
  caret = false,
  contentAlign = 'center',
  ellipsis = true,
  children,
  className,
  ...props
}: ButtonProps) {
  const iconProps = { size: ICON_SIZE };

  const layoutModifier = !iconOnly
    ? [
        contentAlign === 'start' && 'clutter-btn--content-start',
        contentAlign === 'end' && 'clutter-btn--content-end',
        ellipsis && 'clutter-btn--ellipsis',
      ].filter(Boolean)
    : [];

  const cls = [
    'clutter-btn',
    `clutter-btn--${variant}`,
    size !== 'default' && `clutter-btn--${size}`,
    active && 'clutter-btn--active',
    border && 'clutter-btn--bordered',
    iconOnly && 'clutter-btn--icon-only',
    ...layoutModifier,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (iconOnly) {
    const Icon = iconOnly;

    return (
      <button type="button" className={cls} {...props}>
        <span className="clutter-btn__content">
          {children ?? <Icon {...iconProps} />}
        </span>
      </button>
    );
  }

  const IconLeft = iconLeft;
  const IconRight = iconRight;
  const Caret = caret ? CustomIcons.CaretDown : null;

  return (
    <button type="button" className={cls} {...props}>
      <span className="clutter-btn__content">
        {IconLeft && <IconLeft {...iconProps} />}
        {children}
        {IconRight && <IconRight {...iconProps} />}
        {Caret && <Caret size={ICON_SMALL} />}
      </span>
    </button>
  );
}
