import {
  forwardRef,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { buildActivationProps } from '@shared/interaction';
import {
  EntryMenuContext,
  RowContextMenuEnabledContext,
  type EntryMenuApi,
  type RowContextMenuRequest,
} from './EntryMenuContext';
import './Entry.css';

/** A target that keeps the platform's own text menu (a rename in progress). */
const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
/** A control nested in a row: it keeps its own behavior, and right-clicking it opens no second menu. */
const NESTED_CONTROL = 'button, a, [role="menu"]';

export interface EntryProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;

  leading?: ReactNode;
  trailing?: ReactNode;
  hideTrailingOnHover?: boolean;
  actions?: ReactNode;

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
    onContextMenu,
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

  // Right-click on a row that holds a More actions menu (in the Sidebar): the menu opens at the pointer.
  const enabled = useContext(RowContextMenuEnabledContext);
  const menuCount = useRef(0);
  const seq = useRef(0);
  const [request, setRequest] = useState<RowContextMenuRequest | null>(null);
  const menuApi = useMemo<EntryMenuApi>(
    () => ({
      register: () => {
        menuCount.current += 1;
        return () => {
          menuCount.current -= 1;
        };
      },
      request,
    }),
    [request]
  );
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    onContextMenu?.(event);
    const target = event.target as HTMLElement;
    // A portaled menu's events bubble through the React tree; only this row's own DOM counts.
    if (
      !enabled ||
      disabled ||
      menuCount.current === 0 ||
      !event.currentTarget.contains(target) ||
      target.closest(EDITABLE) ||
      event.currentTarget.querySelector(EDITABLE)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (target.closest(NESTED_CONTROL)) {
      return;
    }
    // A keyboard-invoked context menu has no pointer: open at the row's corner.
    const rect = event.currentTarget.getBoundingClientRect();
    const keyboard =
      event.clientX === 0 && event.clientY === 0 && event.detail === 0;
    seq.current += 1;
    setRequest({
      x: keyboard ? rect.left : event.clientX,
      y: keyboard ? rect.bottom : event.clientY,
      seq: seq.current,
    });
  };

  return (
    <EntryMenuContext.Provider value={menuApi}>
      <div
        {...props}
        onContextMenu={handleContextMenu}
        ref={ref}
        style={
          {
            '--tree-level': level,
            ...style,
          } as CSSProperties
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

        <div className="entry__content">{children}</div>

        {(trailing || actions) && (
          <div className="entry__trailing">
            {trailing && <div className="entry__meta">{trailing}</div>}
            {actions && <div className="entry__actions">{actions}</div>}
          </div>
        )}
      </div>
    </EntryMenuContext.Provider>
  );
});

Entry.displayName = 'Entry';
