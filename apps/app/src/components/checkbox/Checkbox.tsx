import { AppIcon } from '@shared/icon';
import './Checkbox.css';

export interface CheckboxProps {
  isChecked?: boolean;
  disabled?: boolean;
  /** The checkbox's accessible name, for one with no visible label beside it. */
  ariaLabel?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  isChecked = false,
  disabled = false,
  ariaLabel,
  onCheckedChange,
}: CheckboxProps) {
  const className = [
    'checkbox',
    isChecked && 'checkbox--checked',
    disabled && 'checkbox--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      onClick={() => onCheckedChange?.(!isChecked)}
    >
      <AppIcon icon={isChecked ? 'checkboxChecked' : 'checkboxUnchecked'} />
    </button>
  );
}
