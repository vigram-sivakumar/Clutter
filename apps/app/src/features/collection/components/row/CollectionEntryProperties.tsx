import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './CollectionEntryProperties.css';

/**
 * One per VALUE (a date, a size, a thumbnail…), not one around all of them, so every value shares
 * the same look from this file's CSS. Put them side by side in a CollectionEntry's `trailing` slot:
 *   <CollectionEntryProperties>5 Oct</CollectionEntryProperties>
 * It draws whatever `children` it is given; the caller formats the value first.
 */
export interface CollectionEntryPropertiesProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const CollectionEntryProperties = forwardRef<
  HTMLDivElement,
  CollectionEntryPropertiesProps
>(function CollectionEntryProperties({ children, className, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      className={['collection-entry-properties', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
});
