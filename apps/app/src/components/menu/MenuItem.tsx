import { Entry, EntryProps } from '@components/entry/Entry';

export interface MenuItemProps extends EntryProps {
  closeOnSelect?: boolean;
}

export function MenuItem({ closeOnSelect = true, ...props }: MenuItemProps) {
  return <Entry role="menuitem" tabIndex={-1} {...props}></Entry>;
}
