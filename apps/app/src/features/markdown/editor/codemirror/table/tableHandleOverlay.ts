import type { EditorView } from '@codemirror/view';

import './tableHandleOverlay.css';
import { getRootSelectionCollapse, tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { createColumnDragGhost, createRowDragGhost, hideColumnSourceContent, hideRowSourceContent, type DragGhost } from './tableDragGhost';
import type { OnTableHandleMenuChange } from './tableHandleMenuSync';
import { moveSelectedColumnToIndex, moveSelectedRowToIndex } from './tableRowColumnMove';
import { tableSelectionChanged } from './tableSelection';

/**
 * Column/row selection-handle wiring — **one physical DOM handle per
 * column, one per row**, each with a permanent structural identity, not a
 * single shared/repositioned pair and not one instance duplicated into
 * every cell.
 *
 * - A column's handle lives in that column's own header cell
 *   (`<thead> > tr > th`) — `columnIndex` is simply "which `<th>` this is,"
 *   never separately tracked or persisted.
 * - A row's handle lives in that row's own first cell (`row.children[0]`,
 *   a `<th>` for the header row, a `<td>` for every body row) — `rowIndex`
 *   is simply "which row this cell's own row is" (native `<tr>.rowIndex`,
 *   header + body combined), same convention every other row-indexed
 *   concept in this feature already uses.
 * - The top-left cell therefore owns both: it is column 0's own header
 *   cell *and* row 0's own first cell.
 * - The header row participates in row selection like any other row
 *   (`TableSelection`'s own `row` kind doc comment already establishes
 *   this; nothing here special-cases it away).
 *
 * Because each handle's identity is a pure function of *where it lives* in
 * the table, nothing needs to persist across a rebuild to keep a selected
 * handle correctly anchored: after `TableWidget.toDOM()` rebuilds, the
 * fresh header cell for column N simply creates column N's handle again,
 * in the same structural place it always lives. There is no "which cell
 * was this column selected from" question to answer, and therefore no
 * extra state needed beyond `TableSelection` itself.
 *
 * **Multiple hover locations, one physical handle.** Hovering *any* cell in
 * column 2 (not just the header) still shows column 2's own single handle
 * — the one living in the header — exactly like hovering any cell in row 3
 * shows row 3's own single handle living in its first cell. This is a
 * lookup by index into a fixed, already-existing element, not a
 * repositioning of a shared element and not a hover-time creation.
 *
 * **Drag-to-reorder** (`resolveColumnTargetIndex`/`resolveRowTargetIndex`,
 * `commitDrag`, the drop-indicator positioning) is unchanged from the
 * previous shared-overlay design — still transient, local closure state
 * (`dragSession`) with zero CM6 involvement until `pointerup`, for the same
 * "a mid-drag dispatch would tear down the very DOM this gesture is
 * manipulating" reason. The only change is where a drag's own `startIndex`
 * comes from: previously a hover-tracked `currentColumnIndex`/
 * `currentRowIndex` variable, now resolved directly from which handle's
 * own hit element was pressed (`resolveHoveredCell`, reused for this too).
 *
 * **Drag ghost** (`tableDragGhost.ts`) — a separate, additional visual
 * layer around this same drag session, not a parallel drag system. Neither
 * the ghost nor the source-hiding it pairs with is created at `pointerdown`
 * time (a plain click must leave the table completely untouched, the same
 * discipline `tableColumnResizeHandle.ts`'s own `materializeDrag` already
 * establishes for column resize) — both materialize only once
 * `session.dragging` actually flips `true`, i.e. the drag threshold has
 * genuinely been crossed (`materializeDragVisuals`). The ghost's own
 * `update()` is called from the same `handlePointerMove` that already
 * re-measures `resolveColumnTargetIndex`/`resolveRowTargetIndex` and
 * repositions the drop indicator — one pointer-move handler, three
 * independent visual updates, never conflated (see `tableDragGhost.ts`'s
 * own top doc comment for why they stay three separate DOM concerns).
 */

const VISIBLE_CLASS = 'cm-table-handle-visible';

/** Minimum pointer travel, in CSS pixels along the gesture's own axis (vertical for a row handle, horizontal for a column handle), before a press is treated as a drag rather than an eventual click. Small enough to feel immediate, large enough that an ordinary imprecise click never accidentally starts a drag. */
const DRAG_THRESHOLD_PX = 4;

export interface HoveredCellInfo {
  readonly columnIndex: number;
  readonly row: HTMLTableRowElement;
  readonly isHeaderRow: boolean;
}

/**
 * Pure DOM-structure query — no layout/measurement, no side effects.
 * `null` whenever `target` isn't inside a real `<td>`/`<th>` belonging to
 * `wrapper`'s own table (a click on the wrapper's own border/padding, a
 * different table's cell entirely, or a non-element target).
 *
 * Reused for identity resolution too, not just hover: a handle's own hit
 * element is a descendant of the cell it structurally belongs to (the
 * header cell for a column handle, the row's own first cell for a row
 * handle), so `target.closest('td, th')` resolves a pressed/clicked handle
 * to its owning cell exactly the same way it resolves an ordinary hover.
 *
 * Deliberately does not live in `tableGeometry.ts` — that module resolves
 * *Markdown source positions*, by design (see its own doc comment: "never
 * reads a pixel position, a rendered layout, or anything from
 * `EditorView`"). This is a DOM-position query one layer up, over the
 * *rendered* table's own DOM, not the document — a different concern that
 * belongs in the rendering layer, not the geometry module.
 */
export function resolveHoveredCell(wrapper: HTMLElement, target: EventTarget | null): HoveredCellInfo | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const cell = target.closest('td, th');
  if (!cell || !wrapper.contains(cell)) {
    return null;
  }
  const row = cell.closest('tr');
  if (!row) {
    return null;
  }
  const columnIndex = Array.from(row.children).indexOf(cell);
  const isHeaderRow = row.parentElement?.tagName === 'THEAD';
  return { columnIndex, row: row as HTMLTableRowElement, isHeaderRow };
}

interface HandlePair {
  readonly hit: HTMLElement;
  readonly visible: HTMLElement;
}

function createColumnHandlePair(cell: HTMLElement): void {
  const hit = document.createElement('div');
  hit.className = 'cm-table-column-handle-hit';
  const visible = document.createElement('div');
  visible.className = 'cm-table-column-handle';
  cell.append(hit, visible);
}

function createRowHandlePair(cell: HTMLElement): void {
  const hit = document.createElement('div');
  hit.className = 'cm-table-row-handle-hit';
  const visible = document.createElement('div');
  visible.className = 'cm-table-row-handle';
  cell.append(hit, visible);
}

function findColumnHandlePair(cell: HTMLElement): HandlePair | null {
  const hit = cell.querySelector<HTMLElement>(':scope > .cm-table-column-handle-hit');
  const visible = cell.querySelector<HTMLElement>(':scope > .cm-table-column-handle');
  return hit && visible ? { hit, visible } : null;
}

function findRowHandlePair(cell: HTMLElement): HandlePair | null {
  const hit = cell.querySelector<HTMLElement>(':scope > .cm-table-row-handle-hit');
  const visible = cell.querySelector<HTMLElement>(':scope > .cm-table-row-handle');
  return hit && visible ? { hit, visible } : null;
}

function hidePair(pair: HandlePair): void {
  pair.hit.classList.remove(VISIBLE_CLASS);
  pair.visible.classList.remove(VISIBLE_CLASS);
}

function showPair(pair: HandlePair): void {
  pair.hit.classList.add(VISIBLE_CLASS);
  pair.visible.classList.add(VISIBLE_CLASS);
}

/**
 * Attaches one column handle per header cell and one row handle per row's
 * own first cell to `wrapper` (`.cm-table-wrapper`) — this file's own top
 * doc comment has the full ownership model. `columnCount` is used only by
 * the drag-to-reorder gesture's own column-target math
 * (`resolveColumnTargetIndex`), unchanged from before.
 */
export function attachTableHandleOverlay(
  wrapper: HTMLElement,
  columnCount: number,
  view: EditorView,
  controller: TableActiveCellController,
  tableFrom: number,
  selectedColumnIndex: number | null,
  selectedRowIndex: number | null,
  getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined
): void {
  function resolveTableElement(): HTMLTableElement | null {
    return wrapper.querySelector<HTMLTableElement>(':scope > .cm-table-scroll > table');
  }

  const tableEl = resolveTableElement();
  if (tableEl) {
    const headerRow = tableEl.rows[0];
    if (headerRow) {
      for (let c = 0; c < headerRow.children.length; c++) {
        createColumnHandlePair(headerRow.children[c] as HTMLElement);
      }
    }
    for (let r = 0; r < tableEl.rows.length; r++) {
      const firstCell = tableEl.rows[r]!.children[0] as HTMLElement | undefined;
      if (firstCell) {
        createRowHandlePair(firstCell);
      }
    }
  }

  const columnDropIndicator = document.createElement('div');
  columnDropIndicator.className = 'cm-table-column-drop-indicator';
  const rowDropIndicator = document.createElement('div');
  rowDropIndicator.className = 'cm-table-row-drop-indicator';
  wrapper.append(columnDropIndicator, rowDropIndicator);

  /** Column N's own permanent handle — always the header cell at index N, never anything else. */
  function columnHandlePair(columnIndex: number): HandlePair | null {
    const headerRow = resolveTableElement()?.rows[0];
    const cell = headerRow?.children[columnIndex] as HTMLElement | undefined;
    return cell ? findColumnHandlePair(cell) : null;
  }

  /** Row N's own permanent handle — always that row's own first cell, never anything else. */
  function rowHandlePair(rowIndex: number): HandlePair | null {
    const row = resolveTableElement()?.rows[rowIndex];
    const cell = row?.children[0] as HTMLElement | undefined;
    return cell ? findRowHandlePair(cell) : null;
  }

  let visibleColumn: HandlePair | null = null;
  let visibleRow: HandlePair | null = null;

  function setVisibleColumn(pair: HandlePair | null): void {
    if (visibleColumn && visibleColumn !== pair) {
      hidePair(visibleColumn);
    }
    if (pair) {
      showPair(pair);
    }
    visibleColumn = pair;
  }

  function setVisibleRow(pair: HandlePair | null): void {
    if (visibleRow && visibleRow !== pair) {
      hidePair(visibleRow);
    }
    if (pair) {
      showPair(pair);
    }
    visibleRow = pair;
  }

  function selectedColumnFallback(): HandlePair | null {
    return selectedColumnIndex !== null ? columnHandlePair(selectedColumnIndex) : null;
  }

  function selectedRowFallback(): HandlePair | null {
    return selectedRowIndex !== null ? rowHandlePair(selectedRowIndex) : null;
  }

  /**
   * While an actual drag is in progress (`session.dragging`, not merely a
   * pointer down that hasn't crossed the threshold yet), ordinary hover
   * must show nothing at all — no other column's/row's handle may appear
   * under the pointer while it's dragging a *different* one across the
   * table, and the dragged column's/row's own handle isn't at its normal
   * structural location anymore anyway (it's been relocated onto the ghost
   * itself, `tableDragGhost.ts`). Set the instant `materializeDragVisuals`
   * runs, cleared the instant `cleanupDragVisuals` does — both below.
   */
  let dragHoverSuppressed = false;

  wrapper.addEventListener('pointermove', (event) => {
    if (dragHoverSuppressed) {
      return;
    }
    const hovered = resolveHoveredCell(wrapper, event.target);
    if (!hovered) {
      setVisibleColumn(selectedColumnFallback());
      setVisibleRow(selectedRowFallback());
      return;
    }
    setVisibleColumn(columnHandlePair(hovered.columnIndex));
    setVisibleRow(rowHandlePair(hovered.row.rowIndex));
  });

  wrapper.addEventListener('pointerleave', () => {
    if (dragHoverSuppressed) {
      return;
    }
    setVisibleColumn(selectedColumnFallback());
    setVisibleRow(selectedRowFallback());
  });

  // ---------------------------------------------------------------------
  // Drag-to-reorder (this file's own top doc comment, § "Drag-to-reorder")
  // ---------------------------------------------------------------------

  interface DragSession {
    readonly axis: 'row' | 'column';
    readonly startIndex: number;
    targetIndex: number;
    readonly startClientX: number;
    readonly startClientY: number;
    dragging: boolean;
    /** `null` until `session.dragging` first flips `true` — see `materializeDragVisuals`'s own doc comment for why this can't be created at `pointerdown` time. */
    ghost: DragGhost | null;
    /** Undoes `hideColumnSourceContent`/`hideRowSourceContent` for exactly the cells this session hid — `null` until materialized, same lifecycle as `ghost`. */
    restoreSource: (() => void) | null;
  }

  let dragSession: DragSession | null = null;
  // Set the instant a real drag (one that crossed `DRAG_THRESHOLD_PX`)
  // commits — every `click` handler below checks and clears this first.
  let suppressNextClick = false;

  /** Column target purely from `clientX` against `wrapper`'s own bounds and `columnCount` — no per-cell measurement needed. Clamped to a real column index even if the pointer strays outside the table entirely (a drag is free to leave the wrapper's own bounds mid-gesture). */
  function resolveColumnTargetIndex(clientX: number): number {
    const wrapperRect = wrapper.getBoundingClientRect();
    if (wrapperRect.width <= 0) {
      return dragSession?.targetIndex ?? 0;
    }
    const raw = Math.floor(((clientX - wrapperRect.left) / wrapperRect.width) * columnCount);
    return Math.min(columnCount - 1, Math.max(0, raw));
  }

  /** Row target as "whichever row's own vertical midpoint `clientY` is nearest to." Nearest-midpoint (not a containment test) so a pointer above the first row or below the last still resolves to a real, in-range index rather than `null`. */
  function resolveRowTargetIndex(clientY: number): number {
    const tableElNow = resolveTableElement();
    if (!tableElNow || tableElNow.rows.length === 0) {
      return dragSession?.targetIndex ?? 0;
    }
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < tableElNow.rows.length; i++) {
      const rect = tableElNow.rows[i]!.getBoundingClientRect();
      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    return nearestIndex;
  }

  function hideDropIndicators(): void {
    columnDropIndicator.classList.remove(VISIBLE_CLASS);
    rowDropIndicator.classList.remove(VISIBLE_CLASS);
  }

  /** Positions/shows the column drop indicator at the boundary the dragged column would land on, or hides it entirely once `targetIndex === startIndex` (a no-op right now). Pure percentage math against `wrapper`, symmetric to `resolveColumnTargetIndex`. */
  function updateColumnDropIndicator(startIndex: number, targetIndex: number): void {
    if (targetIndex === startIndex) {
      columnDropIndicator.classList.remove(VISIBLE_CLASS);
      return;
    }
    const boundaryIndex = targetIndex < startIndex ? targetIndex : targetIndex + 1;
    columnDropIndicator.style.left = `${(boundaryIndex / columnCount) * 100}%`;
    columnDropIndicator.classList.add(VISIBLE_CLASS);
  }

  /** Symmetric to `updateColumnDropIndicator`, for the row axis — top/bottom edge of `targetIndex`'s own row rather than a percentage, since row height is content-driven. */
  function updateRowDropIndicator(startIndex: number, targetIndex: number): void {
    if (targetIndex === startIndex) {
      rowDropIndicator.classList.remove(VISIBLE_CLASS);
      return;
    }
    const tableElNow = resolveTableElement();
    const targetRow = tableElNow?.rows[targetIndex];
    if (!targetRow) {
      rowDropIndicator.classList.remove(VISIBLE_CLASS);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const rowRect = targetRow.getBoundingClientRect();
    const borderWidth = parseFloat(getComputedStyle(wrapper).borderTopWidth) || 0;
    const edgeY = targetIndex < startIndex ? rowRect.top : rowRect.bottom;
    rowDropIndicator.style.top = `${edgeY - wrapperRect.top - borderWidth}px`;
    rowDropIndicator.classList.add(VISIBLE_CLASS);
  }

  function stopTrackingPointer(): void {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerCancel);
  }

  /**
   * Creates the ghost and hides the source column's/row's content —
   * called exactly once per session, the instant `session.dragging` first
   * flips `true` in `handlePointerMove` below, never at `pointerdown`
   * time. `event` is the `pointermove` that actually crossed the
   * threshold, used only for the ghost's *initial* placement
   * (`createColumnDragGhost`/`createRowDragGhost`'s own doc comment) — the
   * grab offset itself is computed from `session.startClientX`/
   * `startClientY` (the original press), never this later position, so
   * the offset stays exactly what "preserve the original grab offset"
   * requires regardless of how far the pointer already drifted before
   * crossing the threshold.
   */
  function materializeDragVisuals(session: DragSession, event: PointerEvent): void {
    const tableEl = resolveTableElement();
    if (!tableEl) {
      return;
    }
    if (session.axis === 'column') {
      session.restoreSource = hideColumnSourceContent(tableEl, session.startIndex);
      session.ghost = createColumnDragGhost(wrapper, tableEl, session.startIndex, session.startClientX, event.clientX);
    } else {
      const row = tableEl.rows[session.startIndex];
      if (!row) {
        return;
      }
      session.restoreSource = hideRowSourceContent(row);
      session.ghost = createRowDragGhost(wrapper, tableEl, session.startIndex, session.startClientY, event.clientY);
    }
    // Suppress ordinary hover for the rest of this drag, and hide whichever
    // real handle happens to be showing right now — including the dragged
    // column's/row's own, which just had its handle visually relocated
    // onto the ghost above and must not also still show at its normal
    // (now content-hidden) structural location.
    dragHoverSuppressed = true;
    setVisibleColumn(null);
    setVisibleRow(null);
  }

  /**
   * Undoes exactly what `materializeDragVisuals` did — a no-op if it never
   * ran (an ordinary click, `session.dragging` still `false`). Safe
   * against a table rebuild mid-drag: both `ghost.destroy()` and the
   * closures `restoreSource` captures tolerate already-detached elements
   * (`tableDragGhost.ts`'s own doc comment on `DragGhost.destroy`).
   *
   * Also restores ordinary hover — necessary even after a *successful*
   * commit: `commitDrag`'s own same-position branch can dispatch a
   * `tableSelectionChanged` whose value is byte-for-byte identical to what
   * was already selected, which `TableWidget.eq()` then reports as no
   * change at all, so this exact closure/DOM survives rather than being
   * replaced by a fresh `attachTableHandleOverlay` call — nothing else
   * would ever clear `dragHoverSuppressed` in that specific case.
   */
  function cleanupDragVisuals(session: DragSession): void {
    session.ghost?.destroy();
    session.ghost = null;
    session.restoreSource?.();
    session.restoreSource = null;
    dragHoverSuppressed = false;
    setVisibleColumn(selectedColumnFallback());
    setVisibleRow(selectedRowFallback());
  }

  /** Commits a completed drag — one transaction, reusing `moveSelectedRowToIndex`/`moveSelectedColumnToIndex` for an actual move, or a plain selection-only dispatch for a same-position drag (never entering undo history — no `changes`). Unchanged in substance from the previous design. */
  function commitDrag(axis: 'row' | 'column', startIndex: number, targetIndex: number): void {
    controller.deactivate();
    if (targetIndex === startIndex) {
      const selection = axis === 'row' ? ({ kind: 'row' as const, tableFrom, rowIndex: startIndex }) : ({ kind: 'column' as const, tableFrom, columnIndex: startIndex });
      view.dispatch({ effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of(selection)], ...getRootSelectionCollapse(view) });
      view.focus();
      return;
    }
    const selection = axis === 'row' ? ({ kind: 'row' as const, tableFrom, rowIndex: startIndex }) : ({ kind: 'column' as const, tableFrom, columnIndex: startIndex });
    const moved = axis === 'row' ? moveSelectedRowToIndex(view, selection, targetIndex) : moveSelectedColumnToIndex(view, selection, targetIndex);
    if (moved) {
      view.focus();
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    const session = dragSession;
    if (!session) {
      return;
    }
    if (!session.dragging) {
      const primaryDelta = session.axis === 'row' ? event.clientY - session.startClientY : event.clientX - session.startClientX;
      if (Math.abs(primaryDelta) < DRAG_THRESHOLD_PX) {
        return;
      }
      session.dragging = true;
      controller.deactivate();
      materializeDragVisuals(session, event);
    }
    session.targetIndex = session.axis === 'row' ? resolveRowTargetIndex(event.clientY) : resolveColumnTargetIndex(event.clientX);
    const wrapperRect = wrapper.getBoundingClientRect();
    if (session.axis === 'row') {
      updateRowDropIndicator(session.startIndex, session.targetIndex);
      session.ghost?.update(event.clientY, wrapperRect);
    } else {
      updateColumnDropIndicator(session.startIndex, session.targetIndex);
      session.ghost?.update(event.clientX, wrapperRect);
    }
  }

  function handlePointerUp(): void {
    const session = dragSession;
    dragSession = null;
    stopTrackingPointer();
    hideDropIndicators();
    if (!session) {
      return;
    }
    if (!session.dragging) {
      // Never crossed the threshold — an ordinary press/release. The
      // native `click` event this same gesture is about to fire handles
      // select-and-open-menu exactly as before; nothing to do here.
      // Neither the ghost nor the source-hiding was ever created, so
      // there's nothing to clean up either.
      return;
    }
    suppressNextClick = true;
    // Commit first, then restore/remove the visuals — matches the
    // milestone's own stated order, and means a failed/no-op move (the
    // "moved" check inside `commitDrag`, mirroring the pre-ghost behavior)
    // still always cleans up regardless of outcome.
    commitDrag(session.axis, session.startIndex, session.targetIndex);
    cleanupDragVisuals(session);
  }

  function handlePointerCancel(): void {
    const session = dragSession;
    dragSession = null;
    stopTrackingPointer();
    hideDropIndicators();
    if (session?.dragging) {
      cleanupDragVisuals(session);
    }
  }

  /** Starts tracking a possible drag from a hit element's own resolved cell identity — ignores anything but a primary-button press, and declines (defensively) if the hit element somehow doesn't resolve to a real cell. */
  function beginDrag(axis: 'row' | 'column', hitEl: HTMLElement, event: PointerEvent): void {
    if (event.button > 0) {
      return;
    }
    const info = resolveHoveredCell(wrapper, hitEl);
    if (!info) {
      return;
    }
    const startIndex = axis === 'row' ? info.row.rowIndex : info.columnIndex;
    suppressNextClick = false;
    dragSession = { axis, startIndex, targetIndex: startIndex, startClientX: event.clientX, startClientY: event.clientY, dragging: false, ghost: null, restoreSource: null };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }

  // ---------------------------------------------------------------------
  // Delegated interaction wiring — one listener per gesture type on
  // `wrapper`, regardless of column/row count, mirroring the previous
  // design's own delegation shape.
  // ---------------------------------------------------------------------

  function closestHit(target: EventTarget | null, className: string): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const hit = target.closest(`.${className}`);
    return hit && wrapper.contains(hit) ? (hit as HTMLElement) : null;
  }

  // Suppresses root CM6's own mousedown handling the same way every other
  // non-cell hit-target in this widget already does — a handle press must
  // never place the root caret, activate a cell, or start
  // `beginCellDragTracking`'s own cross-cell range-selection gesture.
  //
  // **Capture phase, not bubble — load-bearing.** A column handle now
  // lives *inside* its own header `<th>`, and `tableWidget.ts`'s
  // `buildRow()` already attaches its own `mousedown` listener directly on
  // every `<th>`/`<td>` (cell activation / `beginCellDragTracking`). In
  // the bubble phase, that cell-level listener — closer to the actual
  // target — fires *before* any bubble-phase listener on `wrapper` ever
  // would, so `stopPropagation()` here would arrive too late to stop it.
  // A capture-phase listener on `wrapper` runs top-down, before any
  // bubble-phase listener on a descendant cell, so it reliably intercepts
  // first. The previous shared-overlay design never needed this: its
  // handle hit-elements were siblings of the table, never inside any real
  // cell, so no cell-level mousedown listener could ever see that
  // mousedown at all.
  wrapper.addEventListener(
    'mousedown',
    (event) => {
      if (closestHit(event.target, 'cm-table-column-handle-hit') || closestHit(event.target, 'cm-table-row-handle-hit')) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true }
  );

  wrapper.addEventListener('pointerdown', (event) => {
    const columnHit = closestHit(event.target, 'cm-table-column-handle-hit');
    if (columnHit) {
      beginDrag('column', columnHit, event as PointerEvent);
      return;
    }
    const rowHit = closestHit(event.target, 'cm-table-row-handle-hit');
    if (rowHit) {
      beginDrag('row', rowHit, event as PointerEvent);
    }
  });

  /** This exact table's own fresh `<table>` element — resolved from `view.dom` by `tableFrom`, never a closure-captured reference, since a click's own dispatch synchronously rebuilds this widget. */
  function resolveFreshTable(): HTMLTableElement | null {
    return view.dom.querySelector<HTMLTableElement>(`.cm-table-widget[data-table-from="${tableFrom}"] .cm-table-wrapper > .cm-table-scroll > table`);
  }

  function resolveFreshColumnHandle(columnIndex: number): HTMLElement | null {
    const cell = resolveFreshTable()?.rows[0]?.children[columnIndex] as HTMLElement | undefined;
    return cell ? findColumnHandlePair(cell)?.visible ?? null : null;
  }

  function resolveFreshRowHandle(rowIndex: number): HTMLElement | null {
    const cell = resolveFreshTable()?.rows[rowIndex]?.children[0] as HTMLElement | undefined;
    return cell ? findRowHandlePair(cell)?.visible ?? null : null;
  }

  // Click-to-select. `click` fires whenever mousedown+mouseup land on (or
  // near) the same element — true for an ordinary press/release *and* for
  // a completed drag that happened to release back over its own handle, so
  // each branch below checks `suppressNextClick` first (set by
  // `handlePointerUp` the instant a real drag commits) before doing
  // anything else. The `mousedown` listener above still guarantees neither
  // a click nor a drag can ever reach root CM6 or the nested cell editor.
  //
  // Both dispatches share the same shape: `controller.deactivate()` first,
  // then one transaction with *only* `effects` — no `changes`, so this can
  // never modify the Markdown document, and no document change means CM6's
  // `history()` never records it. No `selection` field either, so the root
  // document selection is left exactly where it was.
  wrapper.addEventListener('click', (event) => {
    const columnHit = closestHit(event.target, 'cm-table-column-handle-hit');
    const rowHit = columnHit ? null : closestHit(event.target, 'cm-table-row-handle-hit');
    if (!columnHit && !rowHit) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (columnHit) {
      const info = resolveHoveredCell(wrapper, columnHit);
      if (!info) {
        return;
      }
      const selection = { kind: 'column' as const, tableFrom, columnIndex: info.columnIndex };
      controller.deactivate();
      // `getRootSelectionCollapse` folded into this same dispatch — never a
      // second one — collapses a stale non-empty root selection at the
      // exact moment this handle click takes ownership.
      view.dispatch({
        effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of(selection)],
        ...getRootSelectionCollapse(view),
      });
      // `view.focus()`, right after `controller.deactivate()` — see
      // `tableCellNavigation.ts`'s own `exitAbove`/`exitBelow` for the
      // identical "we just deactivated the cell — hand focus back to root
      // deterministically" pairing.
      view.focus();
      const freshAnchor = resolveFreshColumnHandle(info.columnIndex);
      if (freshAnchor) {
        getOnTableHandleMenuChange()?.({ anchor: freshAnchor, selection });
      }
      return;
    }
    if (rowHit) {
      const info = resolveHoveredCell(wrapper, rowHit);
      if (!info) {
        return;
      }
      const rowIndex = info.row.rowIndex;
      const selection = { kind: 'row' as const, tableFrom, rowIndex };
      controller.deactivate();
      view.dispatch({
        effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of(selection)],
        ...getRootSelectionCollapse(view),
      });
      view.focus();
      const freshAnchor = resolveFreshRowHandle(rowIndex);
      if (freshAnchor) {
        getOnTableHandleMenuChange()?.({ anchor: freshAnchor, selection });
      }
    }
  });

  // Initial state — this widget may be freshly (re)built with a
  // `TableSelection` already set and no hover having occurred yet on this
  // exact DOM instance. Runs synchronously: neither handle's position is
  // ever `getBoundingClientRect()`-measured (pure CSS relative to the
  // owning cell), so — unlike the previous shared-overlay design — there is
  // no detached-subtree measurement concern left to defer for.
  setVisibleColumn(selectedColumnFallback());
  setVisibleRow(selectedRowFallback());
}
