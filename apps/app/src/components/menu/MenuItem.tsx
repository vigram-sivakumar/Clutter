import { useMenuContext } from './Menu.context';
import { Entry, EntryProps } from '@components/entry/Entry';
import { useId } from 'react';

export interface MenuItemProps extends EntryProps {}

export function MenuItem(props: MenuItemProps) {
  const id = useId();
  const { activeId, setActiveId } = useMenuContext();
  const isKeyboardActive = activeId === id;
  return (
    <Entry
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
    />
  );
}
