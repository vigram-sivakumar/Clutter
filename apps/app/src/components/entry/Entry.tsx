import { forwardRef, type HTMLAttributes } from 'react';
import { buildActivationProps } from '@shared/interaction';
import './Entry.css';

export interface EntryProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;

  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  hideTrailingOnHover?: boolean;
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
    hideTrailingOnHover = true,
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
  // The row opens through the one shared activation behavior: a click, or
  // Enter / Space on the row itself (a role="button" <div> has no native
  // activation), ignoring clicks that land on a nested control (the caret
  // button, the actions) and never firing while disabled.
  const activation = buildActivationProps<HTMLDivElement>({
    onActivate: onClick,
    disabled,
    role,
    tabIndex,
  });

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
        hideTrailingOnHover && 'entry-hide-trailing-on-hover',
        selected && 'entry-selected',
        disabled && 'entry-disabled',
      ]
        .filter(Boolean)
        .join(' ')}
      {...activation}
      role={activation.role ?? role}
      tabIndex={activation.tabIndex ?? tabIndex}
      aria-disabled={disabled || undefined}
    >
      {leading && <div className="entry__leading">{leading}</div>}

      <div className="entry__content">
        {/* Bare text is wrapped so it truncates: Entry.css's `.entry__content span` rule is what ellipsizes
            (text-overflow does not reach an anonymous flex item). Element children are left as given. */}
        {typeof children === 'string' || typeof children === 'number' ? <span>{children}</span> : children}
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
