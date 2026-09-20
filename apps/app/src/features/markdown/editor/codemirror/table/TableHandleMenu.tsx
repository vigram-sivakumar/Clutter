import type { MutableRefObject, RefObject } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

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
  /** "Insert row above" — row-only this milestone; a no-op (item still renders/responds normally) when `selection` is a column, per `TableHandleMenu`'s own `handleSelect`. */
  readonly onInsertRowAbove: () => void;
  /** Symmetric to `onInsertRowAbove`, for "Insert row below." */
  readonly onInsertRowBelow: () => void;
  /** "Insert column left" — column-only this milestone; a no-op when `selection` is a row, per `TableHandleMenu`'s own `handleSelect`. */
  readonly onInsertColumnLeft: () => void;
  /** Symmetric to `onInsertColumnLeft`, for "Insert column right." */
  readonly onInsertColumnRight: () => void;
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

// Directional icons (chevronUp/Down/Left/Right — the one complete 4-way
// set already in the icon registry) rather than a uniform "plus" for every
// insert item, so the icon itself shows *where* the new row/column lands
// relative to the selected one, not just that something gets added.
const ROW_ITEMS: readonly OverflowMenuItemConfig[] = [
  { id: 'clear', label: 'Clear contents', icon: 'dismiss' },
  { id: 'insert-above', label: 'Insert row above', icon: 'chevronUp', separatorBefore: true },
  { id: 'insert-below', label: 'Insert row below', icon: 'chevronDown' },
  { id: 'delete', label: 'Delete row', icon: 'trash', separatorBefore: true },
];

const COLUMN_ITEMS: readonly OverflowMenuItemConfig[] = [
  { id: 'clear', label: 'Clear contents', icon: 'dismiss' },
  { id: 'insert-left', label: 'Insert column left', icon: 'chevronLeft', separatorBefore: true },
  { id: 'insert-right', label: 'Insert column right', icon: 'chevronRight' },
  { id: 'delete', label: 'Delete column', icon: 'trash', separatorBefore: true },
];

/**
 * A row/column handle's own floating menu:
 *
 * ```
 * Clear contents
 * ───────────────
 * Insert row above / Insert column left
 * Insert row below / Insert column right
 * ───────────────
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
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColumnLeft,
  onInsertColumnRight,
  suppressReturnFocusRef,
}: TableHandleMenuProps) {
  const items = selection?.kind === 'column' ? COLUMN_ITEMS : ROW_ITEMS;

  function handleSelect(id: string) {
    if (id === 'clear') {
      onClearContents();
    } else if (id === 'insert-above') {
      onInsertRowAbove();
    } else if (id === 'insert-below') {
      onInsertRowBelow();
    } else if (id === 'insert-left') {
      onInsertColumnLeft();
    } else if (id === 'insert-right') {
      onInsertColumnRight();
    }
    // delete: no-op this milestone — see this component's own
    // `onClearContents` doc comment.
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
        size="small"
        onSelect={handleSelect}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        suppressReturnFocusRef={suppressReturnFocusRef}
      />
    </Overlay>
  );
}
