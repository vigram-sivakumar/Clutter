import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { buildActivationProps } from '@shared/interaction';
import '../collectionTokens.css';
import './CollectionTableRow.css';

export interface CollectionTableRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** The same value the table's header uses (`buildCollectionTableGridTemplateColumns`) — what keeps cells under their headers. */
  gridTemplateColumns: string;
  /** The row's cells, one per column, in column order. */
  children: ReactNode;
  /** Revealed on hover/focus, pinned to the row's right edge (not a grid column, so it never disturbs the columns). */
  actions?: ReactNode;
  isSelected?: boolean;
  /** Opens the row. Without it the row is inert: no role, not focusable, no key handling. */
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

/**
 * A table row's shell: the grid, the divider, hover and selected backgrounds,
 * the actions overlay, and whole-row opening through the shared activation
 * behavior (clicks on a nested control are left to it). It knows nothing about
 * what the cells hold.
 */
export const CollectionTableRow = forwardRef<HTMLDivElement, CollectionTableRowProps>(
  function CollectionTableRow(
    { gridTemplateColumns, children, actions, isSelected = false, onClick, className, role, tabIndex, style, ...props },
    ref
  ) {
    return (
      <div
        {...props}
        {...buildActivationProps<HTMLDivElement>({ onActivate: onClick, role, tabIndex })}
        ref={ref}
        className={['cx-collection-table-row', isSelected && 'cx-collection-table-row--selected', className]
          .filter(Boolean)
          .join(' ')}
        style={{ gridTemplateColumns, ...style }}
      >
        {children}
        {actions && <div className="cx-collection-table-row__actions">{actions}</div>}
      </div>
    );
  }
);

CollectionTableRow.displayName = 'CollectionTableRow';
