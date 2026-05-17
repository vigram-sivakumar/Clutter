import React from 'react';
import '../styles/checkbox.css';

import {
  CustomIcons,
  ICON_MEDIUM,
} from '../design-system/icons';

export interface CheckboxProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'onChange' | 'role' | 'aria-checked'
  > {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  onClick,
  ...rest
}: CheckboxProps) {
  const Icon = checked
    ? CustomIcons.CheckboxChecked
    : CustomIcons.CheckboxUnchecked;

  const cls = [
    'clutter-checkbox',
    checked && 'clutter-checkbox--checked',
    disabled && 'clutter-checkbox--disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={cls}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        if (disabled || event.defaultPrevented) {
          return;
        }
        onCheckedChange?.(!checked);
      }}
      {...rest}
    >
      <Icon size={ICON_MEDIUM} aria-hidden />
    </button>
  );
}
