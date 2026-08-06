import { forwardRef, type HTMLAttributes } from 'react';
import './Entry.css';

export interface EntryProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;

  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: React.ReactNode;

  selected?: boolean;
  /**
   * Forces every hover-driven affordance (background, revealed actions —
   * anything Entry.css gates on :hover/:focus-visible) to render as if the
   * row were hovered, even when the pointer isn't over it. For a row whose
   * overflow menu is open: the trigger button that controls the menu lives
   * inside .entry__actions, which is itself only visible on hover — without
   * this, moving the mouse away while the menu is open would hide the very
   * button needed to close it. A parent sets this from whatever state it
   * already owns (e.g. "is this row's menu open"); Entry doesn't know or
   * care why.
   */
  forceHover?: boolean;
  disabled?: boolean;

  level?: number;

  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;

  /** Stable selector for packages/automation — see src/shared/testing/selectors.ts. */
  'data-testid'?: string;
}

export const Entry = forwardRef<HTMLDivElement, EntryProps>(function Entry(
  {
    leading,
    children,
    trailing,
    actions,

    selected = false,
    forceHover = false,
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

    onClick?.(event);
  };

  // A role="button" <div> has no native Enter/Space activation the way a
  // real <button> does (unlike e.g. Caret's own <button>, which needs no
  // equivalent handler). Dispatches a real click at the row itself rather
  // than calling onClick directly, so keyboard activation goes through the
  // exact same path — and the same disabled/interactive-descendant guard —
  // as a mouse click, instead of a second, parallel implementation of it.
  // target !== currentTarget means focus (and thus this keydown) is on a
  // nested interactive element (e.g. the caret button) — its own native
  // handling already covers that case, so this must not double-fire.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.currentTarget.click();
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
        onClick && 'entry-interactive',
        forceHover && 'entry-force-hover',
        selected && 'entry-selected',
        disabled && 'entry-disabled',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={role ?? (onClick ? 'button' : undefined)}
      tabIndex={tabIndex ?? (onClick && !disabled ? 0 : undefined)}
      aria-disabled={disabled || undefined}
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
