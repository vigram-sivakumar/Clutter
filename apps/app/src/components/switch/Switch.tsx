import type { ButtonHTMLAttributes } from 'react';
import './Switch.css';

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'role'
> {
  isChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * An on/off switch for a setting that takes effect immediately. A plain `<button role="switch">`, like
 * `Checkbox`: name it with `aria-label` / `aria-labelledby`, and don't wrap it in a `<label>` (a label re-dispatches
 * the click to its button in the Tauri webview, which toggled it twice).
 */
export function Switch({
  isChecked = false,
  disabled = false,
  onCheckedChange,
  className,
  ...props
}: SwitchProps) {
  const classes = [
    'switch',
    isChecked && 'switch--checked',
    disabled && 'switch--disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={isChecked}
      disabled={disabled}
      className={classes}
      onClick={() => onCheckedChange?.(!isChecked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}
