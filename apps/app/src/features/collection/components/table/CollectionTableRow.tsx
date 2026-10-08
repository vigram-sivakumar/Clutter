import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { buildActivationProps } from '@shared/interaction';
import '../collectionTokens.css';
import './CollectionTableRow.css';

export interface CollectionTableRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** The row's cells, one per column, in column order. */
  children: ReactNode;
  isSelected?: boolean;
  /** Opens the row. Without it the row is inert: no role, not focusable, no key handling. */
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

/**
 * A table row's shell: a subgrid of the table's columns (so every cell sits under its header and a
 * content-sized column is as wide as its widest cell in ANY row), the divider, hover and selected backgrounds,
 * and whole-row opening through the shared activation
 * behavior (clicks on a nested control are left to it). It knows nothing about
 * what the cells hold.
 */
export const CollectionTableRow = forwardRef<HTMLDivElement, CollectionTableRowProps>(
  function CollectionTableRow(
    { children, isSelected = false, onClick, className, role, tabIndex, ...props },
    ref
  ) {
    return (
      <div
        {...props}
        {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
        ref={ref}
        className={['collection-table-row', isSelected && 'collection-table-row--selected', className]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    );
  }
);

CollectionTableRow.displayName = 'CollectionTableRow';
