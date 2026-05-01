import React from 'react';
import { Icons } from '../design-system/icons';

import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

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
  caret?: boolean;
}

const ICON_SIZE = 16;

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
  const iconSize = ICON_SIZE;

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
        <Icon size={iconSize} />
      </button>
    );
  }

  const IconLeft = iconLeft;
  const IconRight = iconRight;
  const Caret = caret ? Icons.CaretDown : null;

  return (
    <button type="button" className={cls} {...props}>
      {IconLeft && <IconLeft size={iconSize} />}
      {children}
      {IconRight && <IconRight size={iconSize} />}
      {Caret && <Caret size={iconSize} />}
    </button>
  );
}
