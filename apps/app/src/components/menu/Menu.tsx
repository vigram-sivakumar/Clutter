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
}

export function Menu({
  children,
  size = 'small',
  menuRef: externalMenuRef,
  onArrowRight,
  onArrowLeft,
  ...props
}: MenuProps) {
  const internalMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = externalMenuRef ?? internalMenuRef;

  const keyboard = useMenuKeyboard(menuRef, { onArrowRight, onArrowLeft });

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

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
