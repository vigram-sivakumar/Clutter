import type { EditorView } from '@codemirror/view';

import { tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { resolveHoveredCell } from './tableHandleOverlay';
import { tableSelectionChanged } from './tableSelection';

/**
 * Rectangular multi-cell selection by mouse drag — `TableSelection`'s own
 * `range` kind (`tableSelection.ts`, previously declared but never
 * produced by any gesture). Cell-first: a click always activates the
 * clicked cell exactly as it always has (`TableWidget.buildRow`'s own
 * `controller.activate(...)` call, synchronous, on `mousedown` — never
 * deferred), and *every* mousedown on a cell — freshly activated by this
 * same click, or already active from an earlier one — also starts this
 * module's own parallel drag tracker. A plain click or an in-cell text
 * drag never crosses into a different cell, so the tracker never fires;
 * the moment it detects the pointer over a *different* cell, it promotes
 * the gesture to a `range` selection.
 *
 * **Investigated directly against the installed `@codemirror/view@6.x`
 * source (not assumed) before choosing this design — see the two findings
 * below, which are what make "let CM6's own drag-selection run completely
 * undisturbed, in parallel" both correct and the smallest mechanism
 * possible, instead of needing to cancel or fight it:**
 *
 * 1. **CM6's own drag-selection can never visually leak into another
 *    cell's DOM.** `EditorView.posAtCoords`/the internal `MouseSelection`
 *    class (`@codemirror/view`'s `handlers.mousedown` → `basicMouseSelection`)
 *    resolves every `mousemove` coordinate via `view.posAndSideAtCoords(...,
 *    false)` — `precise: false`. Read directly from the installed
 *    `posAtCoords` implementation: a Y offset above the document clamps to
 *    `PosAssoc(0, 1)`, below it clamps to `PosAssoc(doc.length, -1)` —
 *    there is no code path that resolves a screen coordinate into a
 *    *different* DOM subtree's content. So even while the user's pointer
 *    is physically hovering a different table cell entirely, the nested
 *    editor's own selection just stays clamped to the start/end of *its
 *    own* tiny per-cell document — never anything resembling the other
 *    cell's own text.
 * 2. **Our own `<td>`-level `preventDefault()`/`stopPropagation()` (kept,
 *    unchanged, for the pre-existing reason below) cannot suppress CM6's
 *    own already-mounted nested-editor mousedown handling.** Read directly
 *    from `EventHandlers.ensureHandlers`/`runHandlers`: CM6 attaches its
 *    own `mousedown` listener straight to `contentDOM`, in the bubble
 *    phase. `contentDOM` is a *descendant* of the `<td>`/`<th>` this
 *    module's own listener lives on (`element` → `wrapper` →
 *    `nestedView.dom` → … → `contentDOM`), so for any click that actually
 *    lands on real cell content, `contentDOM`'s own listener has already
 *    fully run by the time bubbling reaches our ancestor-level listener —
 *    our later `preventDefault()`/`stopPropagation()` call can only affect
 *    propagation to *further* ancestors (root CM6's own `contentDOM`,
 *    still further up), never retroactively un-run a deeper listener that
 *    already fired. The original reason for that call is unrelated and
 *    still applies unchanged: without it, root CM6's own `contentDOM`
 *    listener (an ancestor beyond the table widget entirely) would also
 *    process the same click, racing the root selection/focus against this
 *    cell's own activation (`TableWidget.buildRow`'s own doc comment).
 *
 * Together, these two facts are why no cancellation, capture-phase
 * interception, or second selection system is needed: the two mechanisms
 * (CM6's own text selection, this module's own cell-crossing tracker) run
 * side by side, reading the same mouse events, each free to ignore what
 * the other is doing until the moment this module decides to promote —
 * at which point `controller.deactivate()` unmounts the nested editor's
 * DOM outright, and any further (harmless, invisible, self-terminating at
 * the gesture's own `mouseup`) dispatches CM6's own `MouseSelection` makes
 * to the now-detached view have no observable effect at all.
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
 * no reuse) — confirmed as a real, reproducible bug during an earlier pass
 * of this same feature: holding onto the `mousedown`-time wrapper
 * reference across a rebuild left it detached from the live document, so
 * `resolveHoveredCell`'s own `wrapper.contains(cell)` check silently
 * failed for every subsequent `mousemove` after the first cross-cell one,
 * freezing the range's own `head` instead of tracking it. The exact same
 * class of staleness ADR-034's own "stale click-handler closures" bug
 * names — just for a widget-level element instead of a per-cell range.
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
 * Starts tracking a possible cross-cell drag from a `mousedown` on `anchor`
 * — called from `TableWidget.buildRow`'s own per-cell listener, for *every*
 * cell mousedown (a cell freshly activated by this same click, or one
 * already active from an earlier click), immediately after whatever
 * activation that listener itself performs (or skips, if the cell was
 * already active). Does nothing at all — no dispatch, no interference with
 * CM6's own selection — until the pointer resolves to a cell other than
 * `anchor`; see this file's own header comment for why that's both safe
 * and sufficient. `mouseup` with no crossing ever detected requires no
 * action of its own: activation, if needed, already happened synchronously
 * before this function was even called, and CM6's own native selection
 * (a plain click, or an in-cell text drag) already stands on its own.
 */
export function beginCellDragTracking(view: EditorView, controller: TableActiveCellController, tableFrom: number, anchor: CellCoordinate): void {
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
      // The anchor cell is active (this function is only ever called
      // right after a mousedown that either just activated it or found
      // it already active) — promoting to a range selection must
      // deactivate it (this milestone's own "starting a range selection
      // must deactivate the active cell" requirement).
      // `controller.deactivate()` only unmounts the nested view's DOM;
      // the accompanying `tableActiveCellChanged` effect is what tells
      // `tableWidgetField`'s own `StateField` (and `tableSelectionField`'s
      // own mutual-exclusion check) that no cell is active any more —
      // same pairing `tableHandleOverlay.ts`'s own row/column click
      // handlers already use for the identical reason.
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
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}
