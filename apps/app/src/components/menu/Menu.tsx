import { useEffect, useRef } from 'react';
import type { HTMLAttributes, ReactNode, RefObject } from 'react';

import { MenuContext } from './Menu.context';
import { useMenuKeyboard } from './useMenuKeyboard';

import './Menu.css';

interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
  /**
   * Lets a caller hold onto this menu's own container — e.g. a submenu
   * returning keyboard ownership to its parent Menu on ArrowLeft/Escape
   * needs something focusable to hand focus back to. Same
   * controlled-ref-with-internal-fallback shape as OverflowMenu's own
   * `triggerRef`.
   */
  menuRef?: RefObject<HTMLDivElement>;
  /** See useMenuKeyboard's own doc comment — only ever supplied by OverflowMenu. */
  onArrowRight?: (activeId: string | undefined) => void;
  onArrowLeft?: () => void;
  /**
   * Whether `Menu` focuses its own container on mount. Defaults to `true`
   * — every existing caller (`OverflowMenuBody`, `OverflowSubmenuTrigger`,
   * `Breadcrumbs`, `ImageOptionsMenu`) wants this unchanged, so it's opt
   * *out*, not opt-in. Set `false` when the caller needs something else
   * to hold initial focus instead (e.g. a search input rendered as this
   * menu's own child) — `Menu` still provides the full keyboard/roving-
   * active-item system via `MenuContext` either way; this only concerns
   * where DOM focus lands on open. Deliberately a plain boolean, not a
   * richer "focus target" API: `Menu` doesn't need to know *what* the
   * caller focuses instead, only that it should step out of the way — a
   * target-ref API would solve a need nobody has yet.
   */
  autoFocus?: boolean;
  /** Forwarded verbatim to `useMenuKeyboard`'s own option of the same name — see its doc comment for the full `undefined`-vs-`null`-vs-a-real-id contract. Omitted (the default) for every existing caller. */
  preferredActiveId?: string | null;
}

export function Menu({
  children,
  size = 'small',
  menuRef: externalMenuRef,
  onArrowRight,
  onArrowLeft,
  autoFocus = true,
  preferredActiveId,
  ...props
}: MenuProps) {
  const internalMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = externalMenuRef ?? internalMenuRef;

  const keyboard = useMenuKeyboard(menuRef, {
    onArrowRight,
    onArrowLeft,
    preferredActiveId,
  });

  useEffect(() => {
    if (autoFocus) {
      menuRef.current?.focus();
    }
    // menuRef is a stable ref object (identity never changes across
    // renders), so it's safe to omit — only autoFocus actually gates
    // whether this effect does anything, and it's the one dependency that
    // can meaningfully change across this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  return (
    <MenuContext.Provider value={keyboard}>
      <div
        {...props}
        ref={menuRef}
        role="menu"
        className={['menu', `menu--${size}`].filter(Boolean).join(' ')}
        tabIndex={0}
        aria-activedescendant={keyboard.activeId}
        onKeyDown={keyboard.handleKeyDown}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}
