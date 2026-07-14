import { createContext, useContext } from 'react';

interface MenuContextValue {
  activeId?: string;
  setActiveId(id: string | undefined): void;
}

const MenuContext = createContext<MenuContextValue | undefined>(undefined);

export function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenuContext must be used within a Menu.');
  }
  return context;
}

export { MenuContext };
