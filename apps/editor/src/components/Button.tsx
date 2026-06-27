import type { ReactNode, ButtonHTMLAttributes } from 'react';
import '../styles/button.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;

  variant?: 'filled' | 'outlined' | 'ghost' | 'outline-fill';
  size?: 'large' | 'medium' | 'small';
  interaction?: 'default' | 'subtle';

  isActive?: boolean;
  isDisabled?: boolean;
  isIconOnly?: boolean;

  startSlot?: ReactNode;
  endSlot?: ReactNode;
};

export function Button({
  children,
  variant = 'ghost',
  size = 'large',
  interaction = 'default',
  isActive = false,
  isDisabled = false,
  isIconOnly = false,
  startSlot,
  endSlot,
  ...props
}: ButtonProps) {
  /** Button classes */
  const className = [
    'button',
    `button--${variant}`,
    `button--${size}`,
    `button--${interaction}`,

    isActive && 'button--active',
    isDisabled && 'button--disabled',
    isIconOnly && 'button--icon',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={isDisabled}
      {...props}
    >
      <span className="button__content">
        {!isIconOnly && startSlot}
        {children}
        {!isIconOnly && endSlot}
      </span>
    </button>
  );
}
