import { Icons } from '../design-system/icons';
import '../styles/checkbox.css';

export interface CheckboxProps {
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  checked = false,
  disabled = false,
  onCheckedChange,
}: CheckboxProps) {
  const className = [
    'checkbox',
    checked && 'checkbox--checked',
    disabled && 'checkbox--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={className}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? <Icons.CheckboxChecked /> : <Icons.CheckboxUnchecked />}
    </button>
  );
}
