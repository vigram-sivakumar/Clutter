import React from 'react';
import { CustomIcons, ICON_MEDIUM, ICON_SMALL } from '../design-system/icons';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'small' | 'xsmall';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  border?: boolean;
  iconOnly?: ClutterIcon;
  iconLeft?: ClutterIcon;
  iconRight?: ClutterIcon;
  caret?: boolean;
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
  children,
  className,
  ...props
}: ButtonProps) {
  const iconProps = { size: ICON_SIZE };

  const cls = [
    'clutter-btn',
    `clutter-btn--${variant}`,
    size !== 'default' && `clutter-btn--${size}`,
    active && 'clutter-btn--active',
    border && 'clutter-btn--bordered',
    iconOnly && 'clutter-btn--icon-only',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (iconOnly) {
    const Icon = iconOnly;
    return (
      <button type="button" className={cls} {...props}>
        <span className="clutter-btn__content">
          <Icon {...iconProps} />
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
