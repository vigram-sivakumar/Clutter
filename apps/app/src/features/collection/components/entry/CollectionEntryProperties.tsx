import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { buildActivationProps } from '@shared/interaction';
import './CollectionEntryProperties.css';

/**
 * One per VALUE (a date, a size, a thumbnail…), not one around all of them, so every value shares
 * the same look from this file's CSS. Put them side by side in a CollectionEntry's `trailing` slot:
 *   <CollectionEntryProperties>5 Oct</CollectionEntryProperties>
 * It draws whatever `children` it is given, after an optional `leading`; the caller formats the value first.
 */
export interface CollectionEntryPropertiesProps extends HTMLAttributes<HTMLDivElement> {
  /** Before the value — an `AppIcon` (icon or emoji), for one. */
  leading?: ReactNode;
  /** Extra class(es), added after `collection-entry-properties` — a host's hook to style one value differently. `collection-entry-properties--wiki` is the wiki-link look (with a `collection-entry-properties__text` child for the underlined title). */
  className?: string;
  /** Makes the value clickable: one focusable button that opens on click, Enter and Space (pair it with `collection-entry-properties--action`). Without it the value is inert. */
  onClick?: HTMLAttributes<HTMLDivElement>['onClick'];
  children?: ReactNode;
}

export const CollectionEntryProperties = forwardRef<
  HTMLDivElement,
  CollectionEntryPropertiesProps
>(function CollectionEntryProperties({ leading, children, className, onClick, role, tabIndex, ...props }, ref) {
  return (
    <div
      {...props}
      {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
      ref={ref}
      className={['collection-entry-properties', className]
        .filter(Boolean)
        .join(' ')}
    >
      {leading && <div className="collection-entry-properties__leading">{leading}</div>}
      {children}
    </div>
  );
});
