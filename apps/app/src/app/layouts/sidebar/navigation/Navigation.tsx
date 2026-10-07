import { forwardRef } from 'react';
import { Entry, type EntryProps } from '@components/entry/Entry';

export interface NavigationProps extends Omit<EntryProps, 'children'> {
  title?: string;
  leading?: React.ReactNode;
}

// Forwards its ref to the row so a row that opens an anchored menu (Tags'
// Configure) can hand it to `Overlay` as the anchor.
export const Navigation = forwardRef<HTMLDivElement, NavigationProps>(function Navigation(
  { title, leading, ...entryProps },
  ref
) {
  return (
    <Entry {...entryProps} ref={ref} leading={leading}>
      {title}
    </Entry>
  );
});
