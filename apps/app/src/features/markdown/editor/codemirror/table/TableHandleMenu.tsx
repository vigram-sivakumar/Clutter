import type { MutableRefObject, RefObject } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

import type { TableColumnAlignment } from './tableAlignment';
import { TABLE_HANDLE_MENU_CLASS } from './tableSelection';
import type { TableHandleMenuSelection } from './tableHandleMenuSync';

export interface TableHandleMenuAnchor {
  readonly current: HTMLElement;
}

export interface TableHandleMenuProps {
  /** Bridges `tableHandleOverlay.ts`'s raw CM6 DOM handle into `Overlay`'s `anchorRef` contract — same shape/reasoning as `ImageOptionsMenu`'s own `anchor` prop. `null` when no row/column handle's menu is currently open. */
  readonly anchor: TableHandleMenuAnchor | null;
  /** Which row/column this menu belongs to — determines the item labels (row vs. column) below. `null` exactly when `anchor` is `null`. */
  readonly selection: TableHandleMenuSelection | null;
  readonly onClose: () => void;
  /**
   * "Clear contents" — the only action this milestone actually wires to a
   * real operation, reusing `tableSelectionClear.ts`'s own existing
   * `clearTableSelection` (see `MarkdownEditor.tsx`'s own handler). Insert/
   * Delete are deliberately inert this milestone (per the product spec:
   * "establish the menu items and interaction... the actual operations
   * will be implemented afterward") — their own `MenuItem`s render,
   * respond to hover/keyboard focus, and close the menu on click like any
   * other item, but select into a no-op until the future structural-
   * operation milestone wires them.
   */
  readonly onClearContents: () => void;
  /**
   * "Duplicate" — row handle menu duplicates the selected row immediately
   * below it; column handle menu duplicates the selected column immediately
   * to its right. Two separate callbacks (not one shared, unlike
   * `onClearContents`), mirroring `onDeleteRow`/`onDeleteColumn`'s own
   * per-axis shape — this menu's own `handleSelect` picks the right one
   * from `selection.kind`, matching "delete" exactly.
   */
  readonly onDuplicateRow: () => void;
  /** Symmetric to `onDuplicateRow`, for the column handle menu. */
  readonly onDuplicateColumn: () => void;
  /**
   * "Move up" (row handle menu) — reuses `tableRowColumnMove.ts`'s own
   * `moveSelectedRowUp`. The header is just as movable as any other row
   * (moving it down demotes it to a body row and promotes whichever row
   * takes its slot — see that module's own top doc comment); disabled
   * (`rowMoveAvailability.canMoveUp`) only at the table's first row,
   * whatever currently occupies it.
   */
  readonly onMoveRowUp: () => void;
  /** Symmetric to `onMoveRowUp`, for "Move down" — disabled only at the table's last row. */
  readonly onMoveRowDown: () => void;
  /** Symmetric to `onMoveRowUp`/`onMoveRowDown`, for the column handle menu's "Move left" — disabled at the table's first column. */
  readonly onMoveColumnLeft: () => void;
  /** Symmetric to `onMoveColumnLeft`, for "Move right" — disabled at the table's last column. */
  readonly onMoveColumnRight: () => void;
  /**
   * Which Move directions are currently available for the active
   * row/column selection — `null` renders every Move item disabled (no
   * selection resolved yet, or the selected table could no longer be
   * found), matching `resolveRowMoveAvailability`'s/
   * `resolveColumnMoveAvailability`'s own `null`-means-"nothing to
   * compute" contract (`tableRowColumnMove.ts`). Computed by
   * `MarkdownEditor.tsx` (which owns `viewRef`) fresh on every render this
   * menu is open, mirroring `selection`'s own "owned by the caller, not
   * this component" shape.
   */
  readonly rowMoveAvailability: {
    canMoveUp: boolean;
    canMoveDown: boolean;
  } | null;
  /** Symmetric to `rowMoveAvailability`, for the column handle menu. */
  readonly columnMoveAvailability: {
    canMoveLeft: boolean;
    canMoveRight: boolean;
  } | null;
  /** "Insert row above" — row-only this milestone; a no-op (item still renders/responds normally) when `selection` is a column, per `TableHandleMenu`'s own `handleSelect`. */
  readonly onInsertRowAbove: () => void;
  /** Symmetric to `onInsertRowAbove`, for "Insert row below." */
  readonly onInsertRowBelow: () => void;
  /** "Insert column left" — column-only this milestone; a no-op when `selection` is a row, per `TableHandleMenu`'s own `handleSelect`. */
  readonly onInsertColumnLeft: () => void;
  /** Symmetric to `onInsertColumnLeft`, for "Insert column right." */
  readonly onInsertColumnRight: () => void;
  /**
   * "Align" (column handle menu only — no row equivalent, so this is a
   * no-op when `selection` is a row) — reuses
   * `tableSetColumnAlignment.ts`'s own `setSelectedColumnAlignment`, one
   * shared callback for all three leaves (mirroring `onClearContents`'s
   * own "one callback, the caller's own dispatch decides what to do"
   * shape, not three separate props) since the only per-leaf difference is
   * which `TableColumnAlignment` value to pass through.
   */
  readonly onSetColumnAlignment: (alignment: TableColumnAlignment) => void;
  /**
   * The selected column's own *current* alignment — drives which "Align"
   * submenu leaf renders as the current choice
   * (`OverflowMenuSubmenuItemConfig.selected`). `null` covers both "no
   * explicit alignment" (GFM's own plain `---`, not the same as an
   * explicit `left` — see `tableSetColumnAlignment.ts`'s own top doc
   * comment) and "nothing to report" (a row selection, or a table/column
   * that can no longer be resolved) — no leaf renders `selected` either
   * way, which is correct for both: a plain `---` column has no explicit
   * current choice to highlight, and there is no column at all to have
   * one for a row selection. Computed by `MarkdownEditor.tsx` fresh on
   * every render this menu is open, mirroring `rowMoveAvailability`'s own
   * "owned by the caller" shape.
   */
  readonly columnAlignment: TableColumnAlignment | null;
  /**
   * "Delete row" (`deleteRowSelection`, `tableSelectionDeletion.ts`) — a
   * no-op when `selection` is a column, matching
   * `onInsertColumnLeft`/`onInsertColumnRight`'s own row-side no-op.
   */
  readonly onDeleteRow: () => void;
  /** Symmetric to `onDeleteRow`, for "Delete column" (`deleteColumnSelection`). */
  readonly onDeleteColumn: () => void;
  /**
   * "Format table" — reuses `tableColumnNormalization.ts`'s own explicit
   * `normalizeTableAt`, the table-wide analogue of `FencedCodeActionsMenu`'s
   * own "Format code" (same manual-trigger-only model, same `brush` icon).
   * Table-wide, not row/column-scoped — appears identically in both the row
   * and column handle menus, since it acts on the whole table regardless of
   * which axis is currently selected.
   */
  readonly onFormatTable: () => void;
  /**
   * Set to `true` immediately before this menu closes via an *external*
   * cause (the underlying `TableSelection` going `null` because of a cell
   * click or an outside click — see `tableHandleMenuSync.ts`), so
   * `Overlay`'s own `useOverlayFocus` does not restore focus back to the
   * (by-then-stale) handle and steal it away from whatever the closing
   * click just focused (e.g. the clicked cell's own editor). Left `false`
   * for an internal close (Escape, a menu item click), where restoring
   * focus to the handle is the correct, expected behavior — same as every
   * other menu here. Owned by `MarkdownEditor.tsx`, not this component,
   * specifically so its `onOpenTableHandleMenu` callback can set it at the
   * one moment that matters.
   */
  readonly suppressReturnFocusRef: MutableRefObject<boolean>;
}

// Directional icons so the icon itself shows *where* the new row/column
// lands (or moves to) relative to the selected one, not just that
// something gets added/moved. Labels stay direction-only ("Insert above"/
// "Insert below"/"Move up"/"Move down"/"Insert left"/"Insert right"/"Move
// left"/"Move right") rather than repeating "row"/"column" — this menu is
// already scoped to one axis (the row handle's own menu only ever acts on
// rows, the column handle's only ever columns), so the noun is redundant
// with which menu is even open.
function buildRowItems(
  availability: { canMoveUp: boolean; canMoveDown: boolean } | null
): OverflowMenuItemConfig[] {
  return [
    {
      id: 'insert-above',
      label: 'Insert above',
      icon: 'arrowUp',
    },
    { id: 'insert-below', label: 'Insert below', icon: 'arrowDown' },
    {
      id: 'move-up',
      label: 'Move up',
      icon: 'moveUp',
      disabled: !availability?.canMoveUp,
      separatorBefore: true,
    },
    {
      id: 'move-down',
      label: 'Move down',
      icon: 'moveDown',
      disabled: !availability?.canMoveDown,
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: 'copy',
      separatorBefore: true,
    },
    { id: 'clear', label: 'Clear contents', icon: 'dismiss' },
    {
      id: 'format',
      label: 'Format table',
      icon: 'brush',
      separatorBefore: true,
    },
    {
      id: 'delete',
      label: 'Delete row',
      icon: 'trash',
    },
  ];
}

/** The "Align" submenu's own three leaves — `selected` marks whichever matches `currentAlignment` (`resolveColumnAlignment`, `tableSetColumnAlignment.ts`); none does for `null` (no explicit alignment set, or nothing to report — see `TableHandleMenuProps.columnAlignment`'s own doc comment), which is the correct "no current choice to highlight" rendering for that case, not a bug. */
function buildAlignSubmenu(
  currentAlignment: TableColumnAlignment | null
): OverflowMenuItemConfig['submenu'] {
  return [
    { id: 'align-left', label: 'Left', selected: currentAlignment === 'left' },
    {
      id: 'align-center',
      label: 'Center',
      selected: currentAlignment === 'center',
    },
    {
      id: 'align-right',
      label: 'Right',
      selected: currentAlignment === 'right',
    },
  ];
}

function buildColumnItems(
  availability: { canMoveLeft: boolean; canMoveRight: boolean } | null,
  currentAlignment: TableColumnAlignment | null
): OverflowMenuItemConfig[] {
  return [
    {
      id: 'insert-left',
      label: 'Insert left',
      icon: 'arrowLeft',
    },
    { id: 'insert-right', label: 'Insert right', icon: 'arrowRight' },
    {
      id: 'move-left',
      label: 'Move left',
      icon: 'moveLeft',
      disabled: !availability?.canMoveLeft,
      separatorBefore: true,
    },
    {
      id: 'move-right',
      label: 'Move right',
      icon: 'moveRight',
      disabled: !availability?.canMoveRight,
    },
    {
      id: 'align',
      label: 'Align',
      icon: 'multiLine',
      separatorBefore: true,
      submenu: buildAlignSubmenu(currentAlignment),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: 'copy',
      separatorBefore: true,
    },
    { id: 'clear', label: 'Clear contents', icon: 'dismiss' },
    {
      id: 'format',
      label: 'Format table',
      icon: 'brush',
      separatorBefore: true,
    },
    {
      id: 'delete',
      label: 'Delete column',
      icon: 'trash',
    },
  ];
}

/**
 * A row/column handle's own floating menu:
 *
 * ```
 * Clear contents
 * ───────────────
 * Duplicate
 * Move up / Move left
 * Move down / Move right
 * ───────────────
 * Insert above / Insert left
 * Insert below / Insert right
 * ───────────────
 * Align ›            (column handle only)
 *   Left
 *   Center
 *   Right
 * ───────────────
 * Format table
 * Delete row / Delete column
 * ```
 *
 * Built the same way `ImageOptionsMenu.tsx`/`NoteEmbedMoreActions.tsx` are:
 * this control's own trigger (the handle itself) lives inside
 * `tableHandleOverlay.ts`'s raw CM6 DOM, not a React tree, so this
 * component owns only the menu body (`Overlay` + `OverflowMenuBody`,
 * reused unmodified — same menu/keyboard/focus behavior as every other menu
 * in the app), anchored to that externally-owned handle via the same
 * `{current: HTMLElement}` bridging every sibling embed-menu component
 * already establishes.
 *
 * `side`/`alignment` differ by axis, matching where each handle actually
 * sits: a column handle sits *above* the header, so its menu opens
 * downward; a row handle sits at the table's own *left* edge, so its menu
 * opens rightward — never fixed to one side for both, unlike every other
 * menu here (which each only ever have one trigger shape/position).
 *
 * `Overlay`'s own `className` carries `TABLE_HANDLE_MENU_CLASS` — the one
 * marker `tableSelection.ts`'s own `attachTableOutsideClickHandling` reads
 * to recognize a click *inside* this portaled menu as not "outside the
 * table," even though this menu's own DOM (like every `Overlay`, portaled
 * to `document.body`) is never actually inside any table's own DOM
 * subtree. See that constant's own doc comment for why this exemption is
 * required for correctness, not cosmetic.
 *
 * `backdrop={false}` — unlike every other menu here, which each treat any
 * click elsewhere as a plain "close." This menu's own spec requires a
 * click on a table cell to *both* close the menu *and* activate that cell
 * in the same click. `Overlay`'s default (transparent but
 * `pointer-events: auto`) backdrop sits over the whole viewport and would
 * itself become the click's actual target, silently swallowing it before
 * it ever reaches the cell — confirmed directly: with a backdrop present,
 * the click closed the menu but the cell never activated (no caret, focus
 * stayed on `<body>`). Disabling it lets the click pass straight through
 * to whatever is under the cursor, so the cell's own click-to-activate
 * fires normally; closing on that same click is still handled correctly,
 * without a backdrop, by the existing `attachTableOutsideClickHandling`
 * (a `document`-level `mousedown` listener, unaffected by backdrop
 * presence) plus the `TABLE_HANDLE_MENU_CLASS` exemption above.
 */
export function TableHandleMenu({
  anchor,
  selection,
  onClose,
  onClearContents,
  onDuplicateRow,
  onDuplicateColumn,
  onMoveRowUp,
  onMoveRowDown,
  onMoveColumnLeft,
  onMoveColumnRight,
  rowMoveAvailability,
  columnMoveAvailability,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onSetColumnAlignment,
  columnAlignment,
  onDeleteRow,
  onDeleteColumn,
  onFormatTable,
  suppressReturnFocusRef,
}: TableHandleMenuProps) {
  const items =
    selection?.kind === 'column'
      ? buildColumnItems(columnMoveAvailability, columnAlignment)
      : buildRowItems(rowMoveAvailability);

  function handleSelect(id: string) {
    if (id === 'clear') {
      onClearContents();
    } else if (id === 'duplicate' && selection?.kind === 'row') {
      onDuplicateRow();
    } else if (id === 'duplicate' && selection?.kind === 'column') {
      onDuplicateColumn();
    } else if (id === 'move-up') {
      onMoveRowUp();
    } else if (id === 'move-down') {
      onMoveRowDown();
    } else if (id === 'move-left') {
      onMoveColumnLeft();
    } else if (id === 'move-right') {
      onMoveColumnRight();
    } else if (id === 'insert-above') {
      onInsertRowAbove();
    } else if (id === 'insert-below') {
      onInsertRowBelow();
    } else if (id === 'insert-left') {
      onInsertColumnLeft();
    } else if (id === 'insert-right') {
      onInsertColumnRight();
    } else if (id === 'align-left') {
      onSetColumnAlignment('left');
    } else if (id === 'align-center') {
      onSetColumnAlignment('center');
    } else if (id === 'align-right') {
      onSetColumnAlignment('right');
    } else if (id === 'delete' && selection?.kind === 'row') {
      onDeleteRow();
    } else if (id === 'delete' && selection?.kind === 'column') {
      onDeleteColumn();
    } else if (id === 'format') {
      onFormatTable();
    }
  }

  return (
    <Overlay
      open={anchor !== null}
      onClose={onClose}
      anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
      side={selection?.kind === 'column' ? 'bottom' : 'right'}
      alignment="start"
      className={TABLE_HANDLE_MENU_CLASS}
      backdrop={false}
    >
      <OverflowMenuBody
        items={items}
        onSelect={handleSelect}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        suppressReturnFocusRef={suppressReturnFocusRef}
        submenuClassName={TABLE_HANDLE_MENU_CLASS}
      />
    </Overlay>
  );
}
