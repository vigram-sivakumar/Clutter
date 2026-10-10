import { useMenuContext } from './Menu.context';
import { Entry, EntryProps } from '@components/entry/Entry';
import { useId } from 'react';
import './MenuItem.css';

export interface MenuItemProps extends EntryProps {
  variant?: 'default' | 'muted';
}

export function MenuItem({
  variant = 'default',
  id: idProp,
  children,
  ...props
}: MenuItemProps) {
  const generatedId = useId();
  // A caller that needs to correlate keyboard activity back to a specific
  // item (OverflowMenu resolving ArrowRight against its own item configs)
  // supplies a stable id itself; everyone else keeps the auto-generated one.
  const id = idProp ?? generatedId;
  const { activeId, setActiveId } = useMenuContext();
  const isKeyboardActive = activeId === id;
  return (
    <Entry
      className={['menu__item', `menu__item--${variant}`]
        .filter(Boolean)
        .join(' ')}
      id={id}
      role="menuitem"
      // The keyboard-navigated item should look hovered, the same
      // mechanism a sidebar row's open menu uses to stay visibly hovered —
      // one "force the hover appearance" concept, not two.
      forceHover={isKeyboardActive}
      {...props}
      onMouseEnter={(event) => {
        setActiveId(id);
        props.onMouseEnter?.(event);
      }}
    >
      <span className="menu__item-label">{children}</span>
    </Entry>
  );
}
