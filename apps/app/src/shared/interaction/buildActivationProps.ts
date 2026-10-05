import type { HTMLAttributes, KeyboardEvent, MouseEvent } from 'react';

/** What counts as "a control inside the element" — a click that lands on one belongs to that control, not to the element's own activation. */
const NESTED_INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

export interface ActivationOptions<E extends HTMLElement> {
  /** Absent → the element is inert: nothing is returned, so it gets no role, no tabIndex and no key handling. */
  onActivate?: (event: MouseEvent<E>) => void;
  disabled?: boolean;
  /** Overrides the default `button`. */
  role?: string;
  /** Overrides the default `0` (a disabled element is not focusable by default). */
  tabIndex?: number;
}

export type ActivationProps<E extends HTMLElement> = Pick<
  HTMLAttributes<E>,
  'role' | 'tabIndex' | 'onClick' | 'onKeyDown' | 'aria-disabled'
>;

/**
 * The one definition of "an element that opens something when you click it":
 * a mouse click, or Enter / Space while the element itself has focus.
 *
 * - A click that lands on a nested interactive element (a button, link,
 *   input…) is that control's own and never activates the element.
 * - Enter / Space dispatch a real click at the element, so keyboard and mouse
 *   activation take exactly the same path (and the same guards). A key
 *   pressed while a nested control has focus is left to that control.
 * - Nothing to activate, nothing returned: spread the result onto the element
 *   and an inert element stays inert.
 */
export function buildActivationProps<E extends HTMLElement>({
  onActivate,
  disabled = false,
  role,
  tabIndex,
}: ActivationOptions<E>): ActivationProps<E> {
  if (!onActivate) {
    return {};
  }

  const onClick = (event: MouseEvent<E>) => {
    if (disabled) {
      return;
    }

    const nested = (event.target as HTMLElement).closest(NESTED_INTERACTIVE_SELECTOR);
    if (nested && nested !== event.currentTarget) {
      return;
    }

    onActivate(event);
  };

  const onKeyDown = (event: KeyboardEvent<E>) => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.currentTarget.click();
  };

  return {
    role: role ?? 'button',
    tabIndex: tabIndex ?? (disabled ? undefined : 0),
    onClick,
    onKeyDown,
    'aria-disabled': disabled || undefined,
  };
}
