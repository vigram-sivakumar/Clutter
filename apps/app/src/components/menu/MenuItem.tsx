import { useMenuContext } from './Menu.context';
import { Entry, EntryProps } from '@components/entry/Entry';
import { useId } from 'react';

export interface MenuItemProps extends EntryProps {}

export function MenuItem(props: MenuItemProps) {
  const id = useId();
  const { activeId, setActiveId } = useMenuContext();
  const active = activeId === id;
  return (
    <Entry
      id={id}
      role="menuitem"
      active={active}
      {...props}
      onMouseEnter={(event) => {
        setActiveId(id);
        props.onMouseEnter?.(event);
      }}
    />
  );
}
