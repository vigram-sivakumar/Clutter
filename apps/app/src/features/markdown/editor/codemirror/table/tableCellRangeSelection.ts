import type { EditorView } from '@codemirror/view';

import { tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { resolveHoveredCell } from './tableHandleOverlay';
import { tableSelectionChanged } from './tableSelection';

/**
 * Rectangular multi-cell selection by mouse drag — `TableSelection`'s own
 * `range` kind (`tableSelection.ts`, previously declared but never
 * produced by any gesture). Distinguishing "a plain click that activates a
 * cell" from "the start of a drag that becomes a range selection" is this
 * module's entire job.
 *
 * **The trigger: movement into a logically different cell, not a pixel
 * threshold or a background/text hit-test.** Investigated directly against
 * this codebase's existing per-cell mousedown handling
 * (`TableWidget.buildRow`, `tableWidget.ts`) before choosing this:
 *
 * - An **inactive** cell's own `<td>`/`<th>` is the only thing that ever
 *   receives a mousedown that reaches this module at all — `buildRow`
 *   only attaches a listener in its `else` (non-active) branch; an
 *   *active* cell's own nested `EditorView` has no listener of its own
 *   here and keeps its ordinary native text-selection drag behavior
 *   completely untouched, satisfying "drag over text → normal text
 *   selection" for the one case that matters without this module doing
 *   anything to preserve it.
 * - A **background/non-text hit-test** was rejected: the normal way a
 *   user starts editing a cell is clicking directly on its visible text,
 *   so gating range-selection on "clicked the padding, not the text"
 *   would make the most natural drag-to-select-multiple-cells gesture
 *   (starting the drag right on a cell's own visible content) fail to
 *   register at all.
 * - A **pixel-movement threshold** was rejected on its own: it answers
 *   "has the mouse moved enough to be a drag," never "which cell should
 *   become the range's own head" — small in-cell jitter would still need
 *   a cell-boundary check anyway, so threshold-only reduces to strictly
 *   less information than "did the pointer resolve to a different cell,"
 *   with no offsetting benefit.
 * - **Movement into another cell** directly matches this milestone's own
 *   wording ("drag across cells → range") and requires no tuning: the
 *   moment `elementFromPoint` resolves to a cell other than the
 *   mousedown's own anchor, the gesture is unambiguously a cross-cell
 *   drag. A plain click, by construction, never resolves to any cell but
 *   its own anchor before `mouseup`, so it can never accidentally trip
 *   into range mode.
 *
 * **Activation is deferred from `mousedown` to `mouseup`, not skipped.**
 * Before this module existed, `buildRow`'s own mousedown handler called
 * `controller.activate(...)` synchronously; this module keeps that exact
 * call (same `wrapper`/`cellFrom`/`cellTo` closure capture, same
 * `event.preventDefault()`/`stopPropagation()` at mousedown, unchanged),
 * only moving the decision of *whether* to make that call to `mouseup` —
 * imperceptible for the instantaneous mousedown-then-mouseup gesture a
 * real click always is, and it means a drag that turns out to cross into
 * another cell never has to first activate-then-immediately-undo the
 * anchor cell.
 *
 * **Per-gesture, self-removing listeners — no permanent lifecycle hook.**
 * `document`-level `mousemove`/`mouseup` listeners are installed fresh on
 * every mousedown and torn down on that same gesture's own `mouseup`,
 * unlike `attachTableOutsideClickHandling` (`tableSelection.ts`), which is
 * installed once for the life of the root view. This module needs no
 * equivalent once-per-view wiring in `MarkdownEditor.tsx` — each drag owns
 * its own listener pair start to finish.
 */

/** Same shape as `TableSelection`'s own `range` kind's `anchor`/`head` (`tableSelection.ts`) — used directly, field-for-field, with no separate coordinate type to convert to/from. */
export interface CellCoordinate {
  readonly row: number;
  readonly col: number;
}

function sameCell(a: CellCoordinate, b: CellCoordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * The *current* `.cm-table-wrapper` for the table at `tableFrom` — looked
 * up fresh, by `data-table-from` (`TableWidget.toDOM()`'s own
 * `widget.dataset.tableFrom`), on every call rather than trusted from a
 * closure captured once at `mousedown`. This is required, not defensive:
 * every `tableSelectionChanged` dispatch made mid-drag rebuilds
 * `tableWidgetField`'s `StateField`, and `TableWidget.toDOM()` creates a
 * brand-new `tableWrapper` `<div>` on every rebuild (`document.createElement`,
 * no reuse) — confirmed as a real, reproducible bug during this milestone's
 * own testing: holding onto the `mousedown`-time wrapper reference across a
 * rebuild left it detached from the live document, so `resolveHoveredCell`'s
 * own `wrapper.contains(cell)` check silently failed for every subsequent
 * `mousemove` after the first cross-cell one, freezing the range's own
 * `head` instead of tracking it. The exact same class of staleness
 * ADR-034's own "stale click-handler closures" bug names — just for a
 * widget-level element instead of a per-cell range.
 */
function resolveCurrentTableWrapper(view: EditorView, tableFrom: number): HTMLElement | null {
  return view.dom.querySelector<HTMLElement>(`.cm-table-widget[data-table-from="${tableFrom}"] .cm-table-wrapper`);
}

/** The cell at `(clientX, clientY)`, scoped to `tableWrapper`'s own table (`resolveHoveredCell`'s own containment check) — `null` when the point isn't over any of this table's cells (a drag that has (temporarily) left the table's own bounds, or lands on a border/gap), or when `tableWrapper` itself couldn't be resolved. `row.rowIndex` is the native DOM row index across the whole `<table>` (thead + tbody combined) — already the same `getNavigableRows` convention (header = 0) every other `TableSelection` kind uses, per `tableHandleOverlay.ts`'s own `showRow` precedent. */
function resolveCellAt(view: EditorView, tableFrom: number, clientX: number, clientY: number): CellCoordinate | null {
  const tableWrapper = resolveCurrentTableWrapper(view, tableFrom);
  if (!tableWrapper) {
    return null;
  }
  const target = document.elementFromPoint(clientX, clientY);
  const hovered = resolveHoveredCell(tableWrapper, target);
  if (!hovered) {
    return null;
  }
  return { row: hovered.row.rowIndex, col: hovered.columnIndex };
}

/**
 * Starts tracking a possible drag gesture from a `mousedown` on an
 * inactive cell — called from `TableWidget.buildRow`'s own per-cell
 * listener in place of its previous direct `controller.activate(...)`
 * call, with the exact same closure-captured `wrapper`/`cellFrom`/`cellTo`
 * identity that call already established for the plain-click case (never
 * stale: a plain click, by definition, never survives a mid-gesture
 * rebuild — see `handleMouseUp`'s own comment). `tableFrom`, by contrast,
 * is used to *re-resolve* the table's own current wrapper on every
 * `mousemove` (`resolveCurrentTableWrapper`) rather than being trusted as
 * a fixed element reference — see that function's own doc comment for why
 * a fixed reference goes stale mid-drag. See this file's own header
 * comment for the click-vs-drag trigger rationale.
 */
export function beginCellRangeDrag(
  view: EditorView,
  controller: TableActiveCellController,
  tableFrom: number,
  wrapper: HTMLElement,
  cellFrom: number,
  cellTo: number,
  anchor: CellCoordinate
): void {
  let dragStarted = false;
  let currentHead: CellCoordinate = anchor;

  function handleMouseMove(event: MouseEvent): void {
    const cell = resolveCellAt(view, tableFrom, event.clientX, event.clientY);
    if (!cell) {
      return;
    }

    if (!dragStarted) {
      if (sameCell(cell, anchor)) {
        return;
      }
      dragStarted = true;
      // A different cell may already be active (mid-edit) — the drag
      // itself, not just the eventual range dispatch, is what must
      // deactivate it (this milestone's own "starting a range selection
      // must deactivate the active cell" requirement). `controller.deactivate()`
      // only unmounts the nested view's DOM; the accompanying
      // `tableActiveCellChanged` effect is what tells `tableWidgetField`'s
      // own `StateField` (and `tableSelectionField`'s own mutual-exclusion
      // check) that no cell is active any more — same pairing
      // `tableHandleOverlay.ts`'s own row/column click handlers already
      // use for the identical reason.
      controller.deactivate();
      view.dispatch({
        effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of({ kind: 'range', tableFrom, anchor, head: cell })],
      });
      currentHead = cell;
      return;
    }

    if (sameCell(cell, currentHead)) {
      return;
    }
    currentHead = cell;
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'range', tableFrom, anchor, head: cell })] });
  }

  function handleMouseUp(): void {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    if (!dragStarted) {
      // A plain click — never resolved to any cell but its own anchor
      // before mouseup. Exactly `buildRow`'s own pre-existing
      // `controller.activate(...)` call, just fired here instead of at
      // mousedown.
      controller.activate(view, wrapper, cellFrom, cellTo, cellTo);
    }
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}
