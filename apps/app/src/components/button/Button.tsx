import { forwardRef } from 'react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import './Button.css';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;

  variant?: 'filled' | 'outlined' | 'ghost' | 'outline-fill' | 'primary';
  size?: 'large' | 'medium' | 'small';
  interaction?: 'default' | 'subtle';

  isActive?: boolean;
  isIconOnly?: boolean;

  leading?: ReactNode;
  trailing?: ReactNode;

  className?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      variant = 'ghost',
      size = 'large',
      interaction = 'default',
      isActive = false,
      disabled = false,
      isIconOnly = false,
      leading,
      trailing,
      className,
      ...props
    }: ButtonProps,
    ref
  ) {
    /** Button classes */
    const Class = [
      'button',
      `button--${variant}`,
      `button--${size}`,
      `button--${interaction}`,
      className,

      isActive && 'button--active',
      disabled && 'button--disabled',
      isIconOnly && 'button--icon',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type="button"
        className={Class}
        disabled={disabled}
        {...props}
      >
        <span className="button__content">
          {!isIconOnly && leading}
          {children}
          {!isIconOnly && trailing}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
