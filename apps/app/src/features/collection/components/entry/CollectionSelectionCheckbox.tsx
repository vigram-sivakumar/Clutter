import type { MouseEvent } from 'react';
import { Checkbox } from '@components/checkbox/Checkbox';
import { NESTED_INTERACTIVE_SELECTOR } from '@shared/interaction';

/**
 * What a collection item carries when it can be selected: whether it is, how to flip that, and the name the
 * checkbox is announced by. The generic components only draw it; where the state lives is the collection body's.
 */
export interface CollectionItemSelection {
  /** The item's id in its collection — what a marquee selection reports for the items it covers (`data-selection-id`). */
  readonly id: string;
  readonly checked: boolean;
  /** Selection mode: at least one item of the collection is checked, so every item shows its checkbox, not just a hovered or checked one. */
  readonly active: boolean;
  readonly onToggle: () => void;
  /** The checkbox's accessible name ("Select Plan"). */
  readonly label: string;
}

/** The one selection checkbox every layout draws (the entry's leading slot, the card's corner). A click on it is its own — it never opens the item. */
export function CollectionSelectionCheckbox({ selection }: { selection: CollectionItemSelection }) {
  return (
    <span className="collection-entry__selection-checkbox">
      <Checkbox isChecked={selection.checked} ariaLabel={selection.label} onCheckedChange={selection.onToggle} />
    </span>
  );
}

/**
 * An item's click, with selection mode in front of it: while the collection is in selection mode
 * (`selection.active`), a click anywhere on the item — plain, or with Cmd (macOS) / Ctrl held, or Enter / Space
 * on it — flips THAT item's checkbox, leaving every other item as it is, and does nothing else: the item is not
 * opened. Outside selection mode `onClick` gets every click untouched. Absent `onClick` (an inert item) stays
 * absent, so it stays inert.
 */
export function withSelectionToggle<E extends MouseEvent>(
  selection: CollectionItemSelection | undefined,
  onClick: ((event: E) => void) | undefined
): ((event: E) => void) | undefined {
  if (!onClick) {
    return undefined;
  }
  return (event) => {
    if (selection?.active) {
      event.stopPropagation();
      selection.onToggle();
      return;
    }
    onClick(event);
  };
}

/**
 * The controls inside an item (a cover thumbnail, a link, an Edit button) normally keep their own click: the item's
 * activation leaves them alone. In selection mode a click on one is deliberately the ITEM's — it flips the item's
 * checkbox and the control does nothing, so one click never both selects and, say, opens a picker. Spread this onto
 * the item next to its activation props; it works in the capture phase, ahead of the control, and only for an item
 * that opens something (`hasOnClick`) — an item being renamed keeps its editor. The item's own checkbox is the one
 * control left alone: it already toggles, and must not toggle twice.
 */
export function selectionCaptureProps<E extends MouseEvent & { currentTarget: EventTarget | null }>(
  selection: CollectionItemSelection | undefined,
  hasOnClick: boolean
): { onClickCapture?: (event: E) => void } {
  if (!selection || !hasOnClick) {
    return {};
  }
  return {
    onClickCapture: (event) => {
      if (!selection.active) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('.collection-entry__selection-checkbox')) {
        return;
      }
      const control = target.closest(NESTED_INTERACTIVE_SELECTOR);
      if (control && control !== event.currentTarget) {
        event.preventDefault();
        event.stopPropagation();
        selection.onToggle();
      }
    },
  };
}
