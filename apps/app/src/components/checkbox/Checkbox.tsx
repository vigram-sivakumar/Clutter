import { Icons } from '../../design-system/icons';
import './checkbox.css';

export interface CheckboxProps {
  isChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  isChecked = false,
  disabled = false,
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
      disabled={disabled}
      className={className}
      onClick={() => onCheckedChange?.(!isChecked)}
    >
      {isChecked ? <Icons.CheckboxChecked /> : <Icons.CheckboxUnchecked />}
    </button>
  );
}
