
import './tableHandleOverlay.css';
import { createColumnDragGhost, createRowDragGhost, hideColumnSourceContent, hideRowSourceContent, type DragGhost } from './tableDragGhost';
import type { OnTableHandleMenuChange } from './tableHandleMenuSync';
import { OVERLAY_CLASS as SELECTION_OVERLAY_CLASS, VISIBLE_CLASS as SELECTION_OVERLAY_VISIBLE_CLASS } from './tableSelectionOverlay';

/** One handle per row/column; the engine owns selection and mutations. Drag visuals and geometry are local to this mounted wrapper. */
const VISIBLE_CLASS = 'cm-table-handle-visible';

/**
 * Set on `wrapper` for exactly the duration of a materialized drag (the
 * threshold has been crossed — `materializeDragVisuals`/`cleanupDragVisuals`),
 * cleared the instant it ends. `setVisibleColumn(null)`/`setVisibleRow(null)`
 * already hide the real handle's own bar for this same duration by removing
 * `VISIBLE_CLASS`, but a column's three-dot icon has its own *separate*
 * "show while this column is selected" rule (`tableHandleOverlay.css`) keyed
 * off `.cm-table-column-selected` — a class the header cell keeps wearing
 * throughout the drag (`tableWidget.ts`'s `buildRow()` only ever sets it at
 * render time, no dispatch happens until drop) — and CSS `visibility` lets a
 * descendant's own explicit value win over an ancestor's inherited `hidden`.
 * Without this class, that would keep the icon painting at the dragged
 * column's *source* location even though its bar is hidden, floating there
 * in addition to the one already relocated onto the ghost. This class is
 * what the CSS rule suppressing that keys off instead.
 */
const DRAGGING_ACTIVE_CLASS = 'cm-table-dragging-active';

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

/**
 * Hand-copied inline SVG, not `AppIcon` — this handle is raw CM6 widget DOM
 * (`WidgetType.toDOM()`, `document.createElement` throughout this file),
 * with no React tree available to mount the app's own icon component into,
 * the identical constraint `embedControlIcons.ts` already documents for the
 * same reason. Same three-dot geometry the icon registry ships as
 * `moreHorizontal` (`apps/app/src/shared/icon/svg/more-horizontal.svg`) —
 * reused as-is, already horizontal, no rotation needed (unlike a vertical
 * glyph would).
 */
const COLUMN_HANDLE_ICON_SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="cm-table-column-handle-icon"><circle cx="2.5" cy="8" r="1.75" fill="currentColor"/><circle cx="8" cy="8" r="1.75" fill="currentColor"/><circle cx="13.5" cy="8" r="1.75" fill="currentColor"/></svg>';

/**
 * Same geometry/markup as `COLUMN_HANDLE_ICON_SVG` (the pill background and
 * the three dots are baked into this one SVG, not layered separately) —
 * never redrawn with new circle coordinates for the row axis. The row
 * handle is oriented vertically, so this one is visually rotated 90deg in
 * CSS (`.cm-table-row-handle-icon`, `tableHandleOverlay.css`) instead,
 * turning the same landscape pill/dots into a portrait one.
 */
const ROW_HANDLE_ICON_SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="cm-table-row-handle-icon"><circle cx="2.5" cy="8" r="1.75" fill="currentColor"/><circle cx="8" cy="8" r="1.75" fill="currentColor"/><circle cx="13.5" cy="8" r="1.75" fill="currentColor"/></svg>';

function createColumnHandlePair(cell: HTMLElement): void {
  const hit = document.createElement('div');
  hit.className = 'cm-table-column-handle-hit';
  const visible = document.createElement('div');
  visible.className = 'cm-table-column-handle';
  // The icon sits in its own small wrapper, absolutely positioned/centered
  // on the bar (`.cm-table-column-handle-button`, `tableHandleOverlay.css`)
  // rather than flex-centered by the bar itself. No new visibility state of
  // its own: the icon's own hover-gated visibility rule (that file, same
  // rule) targets `.cm-table-column-handle-icon` directly regardless of
  // this wrapper nesting.
  const button = document.createElement('div');
  button.className = 'cm-table-column-handle-button';
  button.innerHTML = COLUMN_HANDLE_ICON_SVG;
  visible.appendChild(button);
  cell.append(hit, visible);
}

/** Symmetric to `createColumnHandlePair` — same button-wrapper/icon structure, mirrored onto the row axis (`cm-table-row-handle-button`/`-icon`, `tableHandleOverlay.css`). */
function createRowHandlePair(cell: HTMLElement): void {
  const hit = document.createElement('div');
  hit.className = 'cm-table-row-handle-hit';
  const visible = document.createElement('div');
  visible.className = 'cm-table-row-handle';
  const button = document.createElement('div');
  button.className = 'cm-table-row-handle-button';
  button.innerHTML = ROW_HANDLE_ICON_SVG;
  visible.appendChild(button);
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
 * doc comment has the full ownership model.
 *
 * `_columnCount` (the leading underscore is deliberate — it's what
 * silences `noUnusedParameters` for a parameter that's genuinely unused,
 * rather than removing it) is no longer read anywhere in this function's
 * own body: drag-target resolution moved from a `columnCount`-based
 * bucket/percentage calculation to real DOM containment
 * (`resolveColumnTargetIndex`'s own doc comment has the full reasoning),
 * which needs no column *count* at all. Left in the signature rather than
 * removed outright: doing so would touch `tableWidget.ts`'s own call site
 * and every test call site in this file — a wider, separate cleanup from
 * the bug this change actually fixes.
 */
export interface EngineHandleAdapter {
  select(axis: 'row' | 'column', index: number): boolean;
  move(axis: 'row' | 'column', from: number, to: number): boolean;
  selected(axis: 'row' | 'column'): number | null;
}

export function attachTableHandleOverlay(
  wrapper: HTMLElement,
  tableFrom: number,
  getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined,
  engine: EngineHandleAdapter,
): () => void {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  function resolveTableElement(): HTMLTableElement | null {
    // A descendant combinator for the final hop, not `>` — `<table>` now
    // always sits one layer deeper (`.cm-table-scroll > .cm-table-inner >
    // table`, `tableWidget.ts`'s own DOM construction, `tableWidget.css`'s
    // own top doc comment for why `.cm-table-inner` exists at all), never a
    // direct child of `.cm-table-scroll` itself. Never risks matching a
    // deeper, unrelated table, since Markdown table cells never render
    // block-level (only inline) content of their own (`renderInlineMarkdown`).
    return wrapper.querySelector<HTMLTableElement>(':scope > .cm-table-scroll table');
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
    const index = engine.selected('column');
    return index !== null ? columnHandlePair(index) : null;
  }

  function selectedRowFallback(): HandlePair | null {
    const index = engine.selected('row');
    return index !== null ? rowHandlePair(index) : null;
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
  }, options);

  wrapper.addEventListener('pointerleave', () => {
    if (dragHoverSuppressed) {
      return;
    }
    setVisibleColumn(selectedColumnFallback());
    setVisibleRow(selectedRowFallback());
  }, options);
  wrapper.addEventListener('table-engine-selection', () => {
    if (dragHoverSuppressed) return;
    setVisibleColumn(selectedColumnFallback());
    setVisibleRow(selectedRowFallback());
  }, options);

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
  /**
   * The outcome of resolving a drag's target from the pointer's current
   * position — three genuinely different situations, not one nullable
   * number.
   *
   * - `'none'` — no real target under the pointer (a divider, or off any
   *   real cell entirely). `session.targetIndex` is left completely
   *   untouched — it keeps whatever it last resolved to — and only the
   *   indicator is hidden for this one frame.
   * - `'self'` — the pointer is over the *dragged* item's own body. A
   *   genuine no-op (nothing to insert "before/after yourself"):
   *   `session.targetIndex` resets to `startIndex` and the indicator
   *   hides.
   * - `'target'` — the pointer is over a *different* item's body.
   *   `session.targetIndex` (the *final*, post-move array position —
   *   `commitDrag`'s own concern) updates to `targetIndex`, which is
   *   always the same number as `hoveredIndex` (`resolveColumnTargetIndex`'s
   *   own doc comment has the full reasoning for why that raw value, never
   *   a directionally-adjusted one, is what belongs here) — the two
   *   fields exist separately only because the indicator's own boundary
   *   math (`updateColumnDropIndicator`/`updateRowDropIndicator`) reads
   *   `hoveredIndex` under that name, not because the values themselves
   *   ever diverge.
   */
  type DragTargetResolution = { readonly kind: 'none' } | { readonly kind: 'self' } | { readonly kind: 'target'; readonly targetIndex: number; readonly hoveredIndex: number };

  /**
   * Column target = **the column whose own body the pointer is currently
   * inside** — never a midpoint/boundary search. `targetIndex` is always
   * the raw hovered column index, exactly as `moveSelectedColumnToIndex`
   * (`tableRowColumnMove.ts`) expects it: the dragged column's own *final*
   * array position after being removed and reinserted. This is
   * deliberately never adjusted by direction here — a column hovered to
   * the *right* of the dragged one naturally lands immediately after it
   * (removing the dragged column ahead of it already shifted it left by
   * one), and a column hovered to the *left* naturally lands immediately
   * before it, purely as a consequence of array-splice arithmetic, not a
   * special case. Index `0` is therefore always reachable — hovering the
   * first column simply reports `targetIndex: 0`. (An adjustment like
   * that used to live here, to always draw the drop indicator *after* the
   * hovered column regardless of direction — that was a real, shipped
   * regression: it made the committed move land one column further right
   * than intended, `targetIndex === startIndex` false-no-op whenever
   * hovering the dragged column's immediate left neighbor, and index `0`
   * literally unreachable whenever `startIndex > 0`. That adjustment
   * belongs only in `updateColumnDropIndicator`'s own boundary math below,
   * as a purely visual "which edge to draw the line on" decision — it must
   * never again leak into this function's own `targetIndex`.)
   *
   * **`'none'` — the pointer is not over a real cell.** Native hit-testing
   * supplies the target; manual column resize strips are no longer rendered.
   *
   * `hoveredIndex` and `targetIndex` are the same number here — kept as
   * two separate fields (rather than collapsing `'target'` to one) purely
   * to match `DragTargetResolution`'s own shape and because
   * `updateColumnDropIndicator` reads it under the `hoveredIndex` name.
   */
  function resolveColumnTargetIndex(event: PointerEvent, startIndex: number): DragTargetResolution {
    const target = event.target;
    const hovered = resolveHoveredCell(wrapper, target);
    if (!hovered) {
      return { kind: 'none' };
    }
    if (hovered.columnIndex === startIndex) {
      return { kind: 'self' };
    }
    return { kind: 'target', targetIndex: hovered.columnIndex, hoveredIndex: hovered.columnIndex };
  }

  /**
   * Symmetric to `resolveColumnTargetIndex`, for the row axis — target =
   * the row whose own body (any cell in it) the pointer is inside,
   * `targetIndex` always the raw hovered row index (see that function's
   * own doc comment for why no directional adjustment belongs here). No
   * divider/neutral-zone concept here: unlike columns, there is no
   * row-resize feature anywhere in this codebase, so there is no existing
   * real hit-strip to reuse for one — inventing a boundary zone with no
   * real DOM behind it would be exactly the "arbitrary pixel offset" this
   * whole approach is meant to avoid.
   */
  function resolveRowTargetIndex(event: PointerEvent, startIndex: number): DragTargetResolution {
    const hovered = resolveHoveredCell(wrapper, event.target);
    if (!hovered) {
      return { kind: 'none' };
    }
    const hoveredRowIndex = hovered.row.rowIndex;
    if (hoveredRowIndex === startIndex) {
      return { kind: 'self' };
    }
    return { kind: 'target', targetIndex: hoveredRowIndex, hoveredIndex: hoveredRowIndex };
  }

  function hideDropIndicators(): void {
    columnDropIndicator.classList.remove(VISIBLE_CLASS);
    rowDropIndicator.classList.remove(VISIBLE_CLASS);
  }

  /**
   * Positions/shows the column drop indicator at the *hovered* column's
   * own actual rendered edge — its **left** edge when the hovered column
   * sits before the dragged one (`hoveredIndex < startIndex` — the dragged
   * column is about to land *before* it), its **right** edge otherwise
   * (landing *after* it). This direction is purely visual boundary
   * placement — it is never fed back into `targetIndex`/`commitDrag`'s own
   * move (`resolveColumnTargetIndex`'s own doc comment has the full
   * reasoning for why the two must stay separate). Real
   * `getBoundingClientRect()` geometry on the hovered column's own header
   * cell — never `(boundaryIndex / columnCount) * 100%` (this function's
   * own previous implementation, which additionally assumed `wrapper`'s
   * own width always equals the table's own rendered width, false the
   * moment a table has explicit/persisted column widths —
   * `tableColumnWidthMetadata.ts` — and can render narrower than `wrapper`
   * by any amount).
   */
  function updateColumnDropIndicator(startIndex: number, hoveredIndex: number): void {
    const tableElNow = resolveTableElement();
    const hoveredCell = tableElNow?.rows[0]?.children[hoveredIndex] as HTMLElement | undefined;
    if (!tableElNow || !hoveredCell) {
      columnDropIndicator.classList.remove(VISIBLE_CLASS);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const tableRect = tableElNow.getBoundingClientRect();
    const cellRect = hoveredCell.getBoundingClientRect();
    const style = getComputedStyle(wrapper);
    const borderLeftWidth = parseFloat(style.borderLeftWidth) || 0;
    const borderTopWidth = parseFloat(style.borderTopWidth) || 0;
    const edgeX = hoveredIndex < startIndex ? cellRect.left : cellRect.right;
    columnDropIndicator.style.left = `${edgeX - wrapperRect.left - borderLeftWidth}px`;
    columnDropIndicator.style.top = `${tableRect.top - wrapperRect.top - borderTopWidth}px`;
    columnDropIndicator.style.height = `${tableRect.height}px`;
    columnDropIndicator.classList.add(VISIBLE_CLASS);
  }

  /** Both indicator spans use the actual table rect, excluding the scroll
   * gutters and the permanently reserved quick-add space. Boundary
   * coordinates remain wrapper-relative, including horizontal scroll. */
  function updateRowDropIndicator(startIndex: number, hoveredIndex: number): void {
    const tableElNow = resolveTableElement();
    const hoveredRow = tableElNow?.rows[hoveredIndex];
    if (!tableElNow || !hoveredRow) {
      rowDropIndicator.classList.remove(VISIBLE_CLASS);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const tableRect = tableElNow.getBoundingClientRect();
    const rowRect = hoveredRow.getBoundingClientRect();
    const borderTopWidth = parseFloat(getComputedStyle(wrapper).borderTopWidth) || 0;
    const borderLeftWidth = parseFloat(getComputedStyle(wrapper).borderLeftWidth) || 0;
    const edgeY = hoveredIndex < startIndex ? rowRect.top : rowRect.bottom;
    rowDropIndicator.style.top = `${edgeY - wrapperRect.top - borderTopWidth}px`;
    rowDropIndicator.style.left = `${tableRect.left - wrapperRect.left - borderLeftWidth}px`;
    rowDropIndicator.style.width = `${tableRect.width}px`;
    rowDropIndicator.classList.add(VISIBLE_CLASS);
  }

  function stopTrackingPointer(): void {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerCancel);
    document.removeEventListener('keydown', cancelOnEscape);
    wrapper.ownerDocument.defaultView?.removeEventListener('blur', handlePointerCancel);
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
  /** The structural column/row-selection border (`tableSelectionOverlay.ts`) — a sibling of `<table>` inside `.cm-table-scroll`, entirely independent of any per-cell content, which is why `hideColumnSourceContent`/`hideRowSourceContent` (cell-content wrappers only) never touches it on their own. `null` whenever nothing is currently selected (no such element was ever created for this render at all — `tableWidget.ts`'s own "only when a column/row/range is selected" guard). */
  function resolveStructuralSelectionOverlay(): HTMLElement | null {
    return wrapper.querySelector<HTMLElement>(`:scope > .cm-table-scroll > .${SELECTION_OVERLAY_CLASS}`);
  }

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
    wrapper.classList.add(DRAGGING_ACTIVE_CLASS);
    setVisibleColumn(null);
    setVisibleRow(null);
    // There is only one selection (this file's own top doc comment,
    // "Selection model") — the ghost above already carries its visual, so
    // the *structural* border at the dragged row/column's own normal
    // location must not also still show for the rest of this drag.
    resolveStructuralSelectionOverlay()?.classList.remove(SELECTION_OVERLAY_VISIBLE_CLASS);
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
    wrapper.classList.remove(DRAGGING_ACTIVE_CLASS);
    setVisibleColumn(selectedColumnFallback());
    setVisibleRow(selectedRowFallback());
    // Restores what `materializeDragVisuals` suppressed. A no-op (querying
    // an already-detached `wrapper`) whenever this drag's own `commitDrag`
    // just performed a real move — that dispatch already rebuilt the
    // widget from scratch, with its own fresh overlay already visible by
    // default, so there is nothing stale left to fix up here.
    resolveStructuralSelectionOverlay()?.classList.add(SELECTION_OVERLAY_VISIBLE_CLASS);
  }

  /**
   * Commits a completed drag. Selection itself needs no attention here —
   * it was already set to `startIndex` at pointerdown and never changed
   * during the drag (this file's own top doc comment, "Selection model"),
   * so a same-position drop (`targetIndex === startIndex`) is a genuine
   * no-op: nothing to select, nothing to move. An actual move reuses
   * `moveSelectedRowToIndex`/`moveSelectedColumnToIndex` exactly as
   * before — the one transaction that both restructures the document and
   * carries the moved row/column's selection to its new index.
   */
  function commitDrag(axis: 'row' | 'column', startIndex: number, targetIndex: number): void {
    if (targetIndex === startIndex) {
      return;
    }
    engine.move(axis, startIndex, targetIndex);
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
      materializeDragVisuals(session, event);
    }
    // See `DragTargetResolution`'s own doc comment for what each of the
    // three outcomes means and why they need different handling —
    // `'none'` touches neither `session.targetIndex` nor the indicator's
    // hidden state beyond hiding it for this one frame; `'self'` actively
    // resets the pending target back to `startIndex`; `'target'` updates
    // the pending target and shows the indicator at the *hovered* item's
    // own edge (never the same as `targetIndex` when they diverge).
    const resolved = session.axis === 'row' ? resolveRowTargetIndex(event, session.startIndex) : resolveColumnTargetIndex(event, session.startIndex);
    if (resolved.kind === 'none') {
      if (session.axis === 'row') {
        rowDropIndicator.classList.remove(VISIBLE_CLASS);
      } else {
        columnDropIndicator.classList.remove(VISIBLE_CLASS);
      }
    } else if (resolved.kind === 'self') {
      session.targetIndex = session.startIndex;
      if (session.axis === 'row') {
        rowDropIndicator.classList.remove(VISIBLE_CLASS);
      } else {
        columnDropIndicator.classList.remove(VISIBLE_CLASS);
      }
    } else {
      session.targetIndex = resolved.targetIndex;
      if (session.axis === 'row') {
        updateRowDropIndicator(session.startIndex, resolved.hoveredIndex);
      } else {
        updateColumnDropIndicator(session.startIndex, resolved.hoveredIndex);
      }
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    if (session.axis === 'row') {
      session.ghost?.update(event.clientY, wrapperRect);
    } else {
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
      // A plain press/release opens the menu from pointerup, not the later
      // native click event. The pointerdown selection may synchronously
      // rebuild this widget, so this callback can belong to the old
      // instance; resolve the anchor from the live EditorView DOM instead.
      const selection =
        session.axis === 'column'
          ? ({ kind: 'column' as const, tableFrom, columnIndex: session.startIndex })
          : ({ kind: 'row' as const, tableFrom, rowIndex: session.startIndex });
      // Publish logical identity only. React resolves the live handle from
      // the current EditorView when Overlay measures its anchor.
      getOnTableHandleMenuChange()?.({ selection });
      return;
    }
    // Commit first, then restore/remove the visuals — matches the
    // milestone's own stated order, and means a failed/no-op move (the
    // "moved" check inside `commitDrag`, mirroring the pre-ghost behavior)
    // still always cleans up regardless of outcome.
    // Stable engine cells survive a move: restore hidden source before painting
    // the new revision, rather than restoring old visual state onto new data.
    cleanupDragVisuals(session);
    commitDrag(session.axis, session.startIndex, session.targetIndex);
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

  /**
   * Starts tracking a possible drag for a row/column that's already known
   * to be the current selection (`axis`/`startIndex` resolved by the
   * caller, before its own selection dispatch — see this file's own top
   * doc comment, "Selection model"). Never resolves anything from a
   * `hitEl`/DOM identity itself — the caller may be the pointerdown
   * handler's own post-dispatch check (no rebuild happened) or a fresh
   * instance's own setup (a rebuild happened), and either way the only
   * thing this function needs is the four primitive values below.
   */
  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape' && dragSession) { event.preventDefault(); event.stopPropagation(); handlePointerCancel(); }
  }

  function startDragSession(axis: 'row' | 'column', startIndex: number, startClientX: number, startClientY: number): void {
    dragSession = { axis, startIndex, targetIndex: startIndex, startClientX, startClientY, dragging: false, ghost: null, restoreSource: null };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('keydown', cancelOnEscape);
    wrapper.ownerDocument.defaultView?.addEventListener('blur', handlePointerCancel);
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
    { capture: true, ...options }
  );

  // **Selection dispatch lives here, not in the `click` handler below** —
  // this file's own top doc comment, "Selection model," has the full
  // reasoning: pressing a handle unconditionally makes that row/column the
  // one selection right away, before this module even knows whether a drag
  // will follow.
  wrapper.addEventListener('pointerdown', (event) => {
    const pe = event as PointerEvent;
    if (pe.button > 0) {
      return;
    }
    const columnHit = closestHit(event.target, 'cm-table-column-handle-hit');
    const rowHit = columnHit ? null : closestHit(event.target, 'cm-table-row-handle-hit');
    if (!columnHit && !rowHit) {
      return;
    }
    const axis: 'row' | 'column' = columnHit ? 'column' : 'row';
    const info = resolveHoveredCell(wrapper, columnHit ?? rowHit!);
    if (!info) {
      return;
    }
    const startIndex = axis === 'row' ? info.row.rowIndex : info.columnIndex;
    pe.preventDefault();
    pe.stopPropagation();
    if (engine.select(axis, startIndex)) startDragSession(axis, startIndex, pe.clientX, pe.clientY);
  }, options);

  // Menu opening is coordinated with the drag session's document-level
  // pointerup handler above. Do not attach it to this widget's wrapper:
  // pointerdown can synchronously replace that wrapper before click fires.

  // Initial state — this widget may be freshly (re)built with a
  // `TableSelection` already set and no hover having occurred yet on this
  // exact DOM instance. Runs synchronously: neither handle's position is
  // ever `getBoundingClientRect()`-measured (pure CSS relative to the
  // owning cell), so — unlike the previous shared-overlay design — there is
  // no detached-subtree measurement concern left to defer for.
  setVisibleColumn(selectedColumnFallback());
  setVisibleRow(selectedRowFallback());

  return () => {
    handlePointerCancel();
    listeners.abort();
    columnDropIndicator.remove(); rowDropIndicator.remove();
    wrapper.querySelectorAll('.cm-table-column-handle-hit, .cm-table-column-handle, .cm-table-row-handle-hit, .cm-table-row-handle').forEach(el => el.remove());
  };
}
