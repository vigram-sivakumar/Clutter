import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { tableSelectionField, type TableSelection } from './tableSelection';

/**
 * The row/column handle's own floating menu (`TableHandleMenu.tsx`) —
 * shared types + the one CM6-side mechanism that closes it from outside a
 * discrete click (see that component's own doc comment for the full UI).
 *
 * `Extract<TableSelection, {kind:'row'}|{kind:'column'}>` — never `range`:
 * only the row/column handles have a menu at all (`tableHandleOverlay.ts`'s
 * own click handlers are the only callers that ever construct one of
 * these).
 */
export type TableHandleMenuSelection = Extract<TableSelection, { kind: 'row' } | { kind: 'column' }>;

export interface OpenTableHandleMenuParams {
  readonly anchor: HTMLElement;
  readonly selection: TableHandleMenuSelection;
}

/**
 * `null` closes the menu — a single callback rather than a separate
 * open/close pair, mirroring the single `TableSelection | null` field it
 * tracks: there is exactly one "current table handle menu state," same as
 * there is exactly one current `TableSelection`.
 */
export type OnTableHandleMenuChange = (params: OpenTableHandleMenuParams | null) => void;

// `TABLE_HANDLE_MENU_CLASS` lives in `tableSelection.ts` itself (re-exported
// here for convenience) — it needs to be read by
// `attachTableOutsideClickHandling` there, and defining it in *this* file
// instead would make that a circular import (`tableSelection.ts` already
// exports `tableSelectionField`/`TableSelection`, which this file imports).
// See that file's own doc comment on the constant for the full reasoning.
export { TABLE_HANDLE_MENU_CLASS } from './tableSelection';

/**
 * Closes the table handle menu whenever `tableSelectionField` transitions
 * from set to `null` — the two cases the product spec calls out
 * ("clicking a cell should close the menu," "clicking outside... should
 * close the menu"), both of which *already* clear `tableSelectionField` to
 * `null` through entirely pre-existing mechanisms this extension never
 * touches: cell activation's own mutual-exclusivity effect
 * (`tableSelectionField.update()`, `tableSelection.ts`) and
 * `attachTableOutsideClickHandling`'s own explicit dispatch. This
 * extension only *observes* that transition and forwards it to React —
 * one more small, single-purpose `EditorView.updateListener`, the same
 * primitive `tableActiveCellReconciliation`/`tableSelectionCaretVisibility`
 * already use for an analogous "sync a side effect from state" concern.
 *
 * Deliberately does **not** fire when the selection changes from one
 * non-null value to a different one (row → another row, row → column,
 * etc.) — that transition is exactly a handle click, and
 * `tableHandleOverlay.ts`'s own click handler already calls
 * `OnTableHandleMenuChange` directly with the new anchor/selection right
 * after dispatching, which is the only place a real anchor *element* is
 * available (a `StateField`/`Transaction` has no DOM access at all, so
 * "open with this specific handle as anchor" can never be derived from
 * state alone the way "close" can). Firing here too would be redundant at
 * best; since it also has no anchor to offer, it could only ever close the
 * menu, immediately fighting the click handler's own very next call to
 * reopen it.
 */
export function tableHandleMenuSync(getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined): Extension {
  return EditorView.updateListener.of((update) => {
    const wasSet = update.startState.field(tableSelectionField, false) ?? null;
    const isSet = update.state.field(tableSelectionField, false) ?? null;
    if (wasSet !== null && isSet === null) {
      getOnTableHandleMenuChange()?.(null);
    }
  });
}
