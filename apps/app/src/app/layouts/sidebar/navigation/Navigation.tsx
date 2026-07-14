import { Entry, type EntryProps } from '@components/entry/Entry';

export interface NavigationProps extends Omit<EntryProps, 'children'> {
  title?: string;
  leading?: React.ReactNode;
}

export function Navigation({ title, leading, ...entryProps }: NavigationProps) {
  return (
    <Entry {...entryProps} leading={leading}>
      {title}
    </Entry>
  );
}
