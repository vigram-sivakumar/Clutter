import { forwardRef, type HTMLAttributes } from 'react';
import './Entry.css';

export interface EntryProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;

  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: React.ReactNode;

  selected?: boolean;
  disabled?: boolean;

  level?: number;

  onClick?: () => void;
}

export const Entry = forwardRef<HTMLDivElement, EntryProps>(function Entry(
  {
    leading,
    children,
    trailing,
    actions,

    selected = false,
    disabled = false,

    level = 0,
    onClick,
    className,
    role,
    tabIndex,
    style,
    ...props
  },
  ref
) {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    const target = event.target as HTMLElement;

    const interactiveElement = target.closest(
      'button, a, input, select, textarea, [role="button"]'
    );

    if (interactiveElement && interactiveElement !== event.currentTarget) {
      return;
    }

    onClick?.();
  };

  return (
    <div
      {...props}
      ref={ref}
      style={
        {
          '--tree-level': level,
          ...style,
        } as React.CSSProperties
      }
      className={[
        'entry',
        className,
        selected && 'entry-selected',
        disabled && 'entry-disabled',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      role={role ?? (onClick ? 'button' : undefined)}
      tabIndex={tabIndex ?? (onClick && !disabled ? 0 : undefined)}
    >
      {leading && <div className="entry__leading">{leading}</div>}

      <div className="entry__content">
        {children}
        {/* <span className="entry__title">{children}</span> */}
      </div>

      {(trailing || actions) && (
        <div className="entry__trailing">
          {trailing && <div className="entry__meta">{trailing}</div>}
          {actions && <div className="entry__actions">{actions}</div>}
        </div>
      )}
    </div>
  );
});

Entry.displayName = 'Entry';
