import type { ReactNode, ButtonHTMLAttributes } from 'react';
import './Button.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;

  variant?: 'filled' | 'outlined' | 'ghost' | 'outline-fill';
  size?: 'large' | 'medium' | 'small';
  interaction?: 'default' | 'subtle';

  isActive?: boolean;
  isDisabled?: boolean;
  isIconOnly?: boolean;

  leading?: ReactNode;
  trailing?: ReactNode;

  className?: string;
};

export function Button({
  children,
  variant = 'ghost',
  size = 'large',
  interaction = 'default',
  isActive = false,
  isDisabled = false,
  isIconOnly = false,
  leading,
  trailing,
  className,
  ...props
}: ButtonProps) {
  /** Button classes */
  const Class = [
    'button',
    `button--${variant}`,
    `button--${size}`,
    `button--${interaction}`,
    className,

    isActive && 'button--active',
    isDisabled && 'button--disabled',
    isIconOnly && 'button--icon',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={Class} disabled={isDisabled} {...props}>
      <span className="button__content">
        {!isIconOnly && leading}
        {children}
        {!isIconOnly && trailing}
      </span>
    </button>
  );
}
