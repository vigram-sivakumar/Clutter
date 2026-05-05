import React from 'react';
import { Icons, ICON_MEDIUM } from '../design-system/icons';

import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'small' | 'xsmall';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  border?: boolean;
  iconOnly?: PhosphorIcon;
  iconLeft?: PhosphorIcon;
  iconRight?: PhosphorIcon;
  /** Phosphor `weight` for icons this component renders. */
  iconWeight?: IconProps['weight'];
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
  iconWeight,
  caret = false,
  children,
  className,
  ...props
}: ButtonProps) {
  const iconProps: { size: number; weight?: IconProps['weight'] } = { size: ICON_SIZE };
  if (iconWeight !== undefined) {
    iconProps.weight = iconWeight;
  }

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
  const Caret = caret ? Icons.CaretDown : null;

  return (
    <button type="button" className={cls} {...props}>
      <span className="clutter-btn__content">
        {IconLeft && <IconLeft {...iconProps} />}
        {children}
        {IconRight && <IconRight {...iconProps} />}
        {Caret && <Caret {...iconProps} />}
      </span>
    </button>
  );
}
