import { useEffect, useRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import { MenuContext } from './Menu.context';
import { useMenuKeyboard } from './useMenuKeyboard';

import './Menu.css';

interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: 'medium' | 'small';
}

export function Menu({ children, size = 'medium', ...props }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const keyboard = useMenuKeyboard(menuRef);

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
