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
    // An icon-only button (leading/trailing never render for it, see
    // button__content below) has its own padding: 0 treatment and is
    // excluded from all three cases here. A button with both a leading
    // and a trailing icon has no side "away from" an icon, so it also
    // gets neither modifier — same as the icon-only case, it falls back
    // to the unmodified base padding.
    const hasLeadingOnly = !isIconOnly && Boolean(leading) && !trailing;
    const hasTrailingOnly = !isIconOnly && Boolean(trailing) && !leading;
    const hasNoIcon = !isIconOnly && !leading && !trailing;

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
      hasLeadingOnly && 'button--has-leading',
      hasTrailingOnly && 'button--has-trailing',
      hasNoIcon && 'button--no-icon',
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
