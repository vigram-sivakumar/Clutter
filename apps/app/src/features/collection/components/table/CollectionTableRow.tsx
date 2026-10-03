import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import './CollectionTableRow.css';

export interface CollectionTableRowProps extends HTMLAttributes<HTMLDivElement> {
  /** The same value the table's header uses (`buildCollectionTableGridTemplateColumns`) — what keeps cells under their headers. */
  gridTemplateColumns: string;
  /** The row's cells, one per column, in column order. */
  children: ReactNode;
  /** Hover-revealed overlay pinned to the row's right edge (not a grid column, so it never disturbs the columns). */
  actions?: ReactNode;
}

/**
 * The Table layout's row shell: the grid, the divider, hover/selected
 * backgrounds, and the whole-row open handling (role/keyboard activation, and
 * ignoring clicks that land on a nested interactive element). A collection
 * fills it with its own cells.
 */
export const CollectionTableRow = forwardRef<HTMLDivElement, CollectionTableRowProps>(
  function CollectionTableRow(
    { gridTemplateColumns, children, actions, className, onClick, role, tabIndex, style, ...props },
    ref
  ) {
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const interactiveElement = target.closest('button, a, input, select, textarea, [role="button"]');

      if (interactiveElement && interactiveElement !== event.currentTarget) {
        return;
      }

      onClick?.(event);
    };

    // The row itself (not a cell) is the click/keyboard target — same role=
    // "button"/tabIndex/Enter-Space-dispatches-a-real-click pattern as
    // CollectionEntry's own handleKeyDown.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      event.currentTarget.click();
    };

    return (
      <div
        {...props}
        ref={ref}
        className={['collection-table-row', className].filter(Boolean).join(' ')}
        onClick={onClick ? handleClick : undefined}
        onKeyDown={onClick ? handleKeyDown : undefined}
        role={role ?? (onClick ? 'button' : undefined)}
        tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
        style={{ gridTemplateColumns, ...style }}
      >
        {children}
        {actions && <div className="collection-table-row__actions">{actions}</div>}
      </div>
    );
  }
);

CollectionTableRow.displayName = 'CollectionTableRow';
