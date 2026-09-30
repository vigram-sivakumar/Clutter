import type { EditorView } from '@codemirror/view';

import './tableHandleOverlay.css';
import { getRootSelectionCollapse, tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { createColumnDragGhost, createRowDragGhost, hideColumnSourceContent, hideRowSourceContent, type DragGhost } from './tableDragGhost';
import type { OnTableHandleMenuChange } from './tableHandleMenuSync';
import { moveSelectedColumnToIndex, moveSelectedRowToIndex } from './tableRowColumnMove';
import { tableSelectionChanged } from './tableSelection';
import { setPendingTableScrollRestore } from './tableWidget';
import { OVERLAY_CLASS as SELECTION_OVERLAY_CLASS, VISIBLE_CLASS as SELECTION_OVERLAY_VISIBLE_CLASS } from './tableSelectionOverlay';

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
 * time (the *visuals* stay untouched by a plain click, the same discipline
 * `tableColumnResizeHandle.ts`'s own `materializeDrag` already establishes
 * for column resize) — both materialize only once `session.dragging`
 * actually flips `true`, i.e. the drag threshold has genuinely been crossed
 * (`materializeDragVisuals`). The ghost's own `update()` is called from the
 * same `handlePointerMove` that already re-measures
 * `resolveColumnTargetIndex`/`resolveRowTargetIndex` and repositions the
 * drop indicator — one pointer-move handler, three independent visual
 * updates, never conflated (see `tableDragGhost.ts`'s own top doc comment
 * for why they stay three separate DOM concerns).
 *
 * **Selection model — there is only one `TableSelection`, ever.** Pressing
 * a handle (`pointerdown`, not `click`) unconditionally makes that
 * row/column *the* selection right then, replacing whatever was selected
 * before (a range, a different row/column, nothing) — before this module
 * even knows whether a drag will follow. There is no `previousSelection` to
 * restore and no separate selection for the ghost: a drag session's own
 * `startIndex` simply *is* the already-current selection's index, and the
 * ghost is only that same selection's visual, relocated, while the
 * structural handle/overlay at its normal location is suppressed for the
 * gesture's duration (`materializeDragVisuals`/`cleanupDragVisuals`).
 * Concretely: `commitDrag`'s no-move branch dispatches nothing (there is
 * nothing left to select — pointerdown already did it), and
 * `handlePointerCancel` never restores an old selection (there isn't
 * one to restore) — it just re-shows the *same* row/column's ordinary
 * handle/overlay once the drag visuals are torn down.
 *
 * Dispatching this early has one real consequence worth naming:
 * `TableWidget.eq()` compares `selectedColumnIndex`/`selectedRowIndex`, so
 * a *genuine* selection change (pressing a different row/column than
 * whatever was selected before) rebuilds the whole widget — a fresh
 * `attachTableHandleOverlay()` call, fresh `wrapper`, mid-gesture, before
 * this module even knows a drag is coming. `pendingDragResumeByTableFrom`
 * (module-level, keyed by `tableFrom` — the same "smuggle state across one
 * rebuild" shape `tableWidget.ts`'s own `pendingScrollRestoreByTableFrom`
 * already uses) is how the gesture survives that: the pointerdown handler
 * records `{axis, startIndex, startClientX, startClientY}` there
 * immediately before dispatching, and *exactly one* of two places
 * consumes it synchronously afterward — either the fresh instance's own
 * setup (if the dispatch really did rebuild), or this same handler's own
 * post-dispatch check (if `eq()` reported no change at all, e.g. this
 * handle's row/column was already the sole selection) — whichever runs
 * first genuinely exists. Either way `startDragSession` ends up called
 * exactly once, against whichever `wrapper` is now actually live.
 */

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

/** What a pointerdown needs to hand a reorder drag *after* its own immediate selection dispatch — see this file's own top doc comment, "Selection model," for why a rebuild can land in between and why this is keyed by `tableFrom` rather than held in a local variable. */
interface PendingDragResume {
  readonly axis: 'row' | 'column';
  readonly startIndex: number;
  readonly startClientX: number;
  readonly startClientY: number;
}

/** Module-level, not per-instance — the whole point is surviving the boundary between one `attachTableHandleOverlay` instance and the next. At most one entry is ever live per `tableFrom` at a time: set immediately before the pointerdown handler's own selection dispatch, consumed synchronously afterward by whichever of the two possible readers (this file's own top doc comment) actually runs. */
const pendingDragResumeByTableFrom = new Map<number, PendingDragResume>();

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

/**
 * Mounted as a direct child of `wrapper` (`.cm-table-wrapper`), *not* inside
 * `columnIndex`'s own header cell the way every other handle-overlay
 * element still is — the one deliberate exception, and the reason is
 * clipping, not ownership: `.cm-table-scroll` (an ancestor of every `<th>`)
 * gets `overflow-x: auto` the moment a table has explicit widths
 * (`tableWidget.css`), which per the CSS Overflow spec forces its computed
 * `overflow-y` to `auto` too — a real vertical-clipping box neither
 * `.cm-table-widget` nor `.cm-table-wrapper` ever becomes (both stay
 * `overflow: visible` unconditionally). The three-dot icon layered on this
 * bar pokes ~6-8px above the header cell's own top edge by design (this
 * exact visual position is a hard requirement, not something this move is
 * allowed to change) — inside a `<th>`, that protrusion is silently cropped
 * by `.cm-table-scroll`'s own forced clip the instant a table breaks the
 * ~720px column (confirmed live, twice: reproducible on any resized table
 * whose columns make `.cm-table-scroll` an explicit-width scroll
 * container). Mounting here instead, inside `.cm-table-wrapper` (never a
 * clipping box, regardless of column widths), removes the clip entirely
 * without moving the handle's own visual position by one pixel — position
 * is now computed explicitly (`positionColumnHandle`, below) from the
 * owning header cell's own live `getBoundingClientRect()`, reproducing the
 * exact same centered-on-the-border placement the old `position:
 * relative`-on-`<th>` CSS used to give for free.
 *
 * `columnIndex` is stamped onto both elements as `data-column-index` — the
 * only way to recover "which column does this hit-element belong to" now
 * that `target.closest('td, th')` (`resolveHoveredCell`'s own mechanism,
 * still exactly correct for ordinary cell hover) can no longer reach an
 * owning cell from here; every call site that used to resolve a handle's
 * column via cell ancestry now reads this attribute directly instead.
 *
 * `selected` drives a *second*, independent reason: the icon's own
 * "visible while hovered *or* selected" CSS rule used to be a `~` general
 * sibling selector (`.cm-table-column-handle-hit:hover ~
 * .cm-table-column-handle .cm-table-column-handle-icon`) plus an ancestor
 * selector for the selected case (`.cm-table-column-selected
 * .cm-table-column-handle-icon`) — both relied on each hit/bar pair being
 * isolated inside its own unique header cell, where a sibling/ancestor
 * match could only ever reach *that one column's own* bar. Now that every
 * pair is a flat sibling of every other one directly under `wrapper` (this
 * function's own top doc comment), a general sibling selector on one hit's
 * `:hover` matches *every* bar after it in DOM order, not just its own —
 * confirmed live: hovering one column's handle lit up every later column's
 * handle too. Fixed by dropping CSS `:hover` matching entirely for this
 * element and driving both states from JS instead, each scoped by closure
 * to exactly this one pair: `cm-table-column-handle--engaged` toggled
 * directly on `visible` by `hit`'s own `pointerenter`/`pointerleave`
 * (neither bubbles, so attaching straight to `hit` needs no index lookup at
 * all), and `cm-table-column-handle--selected` applied once here at
 * creation time — selection changes always rebuild this whole overlay via a
 * fresh `attachTableHandleOverlay` call, so "once at creation" is already
 * exactly as live as `buildRow()`'s own identical one-time
 * `cm-table-column-selected` tagging (that cell-level class still drives
 * the column background highlight, `tableWidget.css`, entirely unrelated to
 * this file).
 */
function createColumnHandlePair(wrapper: HTMLElement, columnIndex: number, selected: boolean): void {
  const hit = document.createElement('div');
  hit.className = 'cm-table-column-handle-hit';
  hit.dataset.columnIndex = String(columnIndex);
  const visible = document.createElement('div');
  visible.className = selected ? 'cm-table-column-handle cm-table-column-handle--selected' : 'cm-table-column-handle';
  visible.dataset.columnIndex = String(columnIndex);
  // The icon sits in its own small wrapper, absolutely positioned/centered
  // on the bar (`.cm-table-column-handle-button`, `tableHandleOverlay.css`)
  // rather than flex-centered by the bar itself. No new visibility state of
  // its own: the icon's own engaged/selected-gated visibility rule (that
  // file, same rule) targets `.cm-table-column-handle-icon` directly
  // regardless of this wrapper nesting.
  const button = document.createElement('div');
  button.className = 'cm-table-column-handle-button';
  button.innerHTML = COLUMN_HANDLE_ICON_SVG;
  visible.appendChild(button);
  // Scoped to exactly this pair by closure — see this function's own doc
  // comment above for why a CSS sibling selector can no longer do this job.
  hit.addEventListener('pointerenter', () => {
    visible.classList.add('cm-table-column-handle--engaged');
  });
  hit.addEventListener('pointerleave', () => {
    visible.classList.remove('cm-table-column-handle--engaged');
  });
  wrapper.append(hit, visible);
}

/**
 * Symmetric to `createColumnHandlePair` — same button-wrapper/icon
 * structure and the identical reason for living in `wrapper` rather than
 * inside its own owning cell: `.cm-table-scroll` becomes a real vertical-
 * clipping box the moment a table has explicit widths, and this handle's
 * own left-edge protrusion (`inset-inline-start: -1px`,
 * `tableHandleOverlay.css`) is clipped there exactly like the column
 * handle's own top-edge protrusion was — the row axis has no equivalent
 * *horizontal*-clip concern (`.cm-table-scroll`'s own forced clip is
 * vertical only), but the row handle still needs to be reachable/visible at
 * *every* horizontal scroll position, which only holds if it isn't
 * confined to `.cm-table-scroll`'s own clipped box in the first place.
 * `rowIndex` is stamped as `data-row-index`, mirroring
 * `data-column-index` — the same "recover identity without cell ancestry"
 * need `findRowHandlePair`/the hover-tracking pointermove handler both have.
 *
 * `selected` mirrors `createColumnHandlePair`'s own identical parameter —
 * see that function's own doc comment for why the icon's "visible while
 * selected" CSS rule needs a class on the bar itself now
 * (`cm-table-row-handle--selected`), rather than the ancestor-based
 * `.cm-table-row-selected .cm-table-row-handle-icon` this used to be able
 * to rely on before the row handle also moved out of its owning cell. The
 * same function's own doc comment also covers why the *hover* state
 * (`cm-table-row-handle--engaged`, below) is now JS-driven per pair rather
 * than a CSS `~` sibling selector — the identical cross-talk bug (hovering
 * one row's handle lighting up every later row's) applies here verbatim.
 */
function createRowHandlePair(wrapper: HTMLElement, rowIndex: number, selected: boolean): void {
  const hit = document.createElement('div');
  hit.className = 'cm-table-row-handle-hit';
  hit.dataset.rowIndex = String(rowIndex);
  const visible = document.createElement('div');
  visible.className = selected ? 'cm-table-row-handle cm-table-row-handle--selected' : 'cm-table-row-handle';
  visible.dataset.rowIndex = String(rowIndex);
  const button = document.createElement('div');
  button.className = 'cm-table-row-handle-button';
  button.innerHTML = ROW_HANDLE_ICON_SVG;
  visible.appendChild(button);
  hit.addEventListener('pointerenter', () => {
    visible.classList.add('cm-table-row-handle--engaged');
  });
  hit.addEventListener('pointerleave', () => {
    visible.classList.remove('cm-table-row-handle--engaged');
  });
  wrapper.append(hit, visible);
}

/** Looks up column `columnIndex`'s own handle pair by `data-column-index` (`createColumnHandlePair`'s own doc comment) — `wrapper`'s own direct children now, never a cell's. */
function findColumnHandlePair(wrapper: HTMLElement, columnIndex: number): HandlePair | null {
  const hit = wrapper.querySelector<HTMLElement>(`:scope > .cm-table-column-handle-hit[data-column-index="${columnIndex}"]`);
  const visible = wrapper.querySelector<HTMLElement>(`:scope > .cm-table-column-handle[data-column-index="${columnIndex}"]`);
  return hit && visible ? { hit, visible } : null;
}

/** Looks up row `rowIndex`'s own handle pair by `data-row-index` (`createRowHandlePair`'s own doc comment) — `wrapper`'s own direct children now, never a cell's. */
function findRowHandlePair(wrapper: HTMLElement, rowIndex: number): HandlePair | null {
  const hit = wrapper.querySelector<HTMLElement>(`:scope > .cm-table-row-handle-hit[data-row-index="${rowIndex}"]`);
  const visible = wrapper.querySelector<HTMLElement>(`:scope > .cm-table-row-handle[data-row-index="${rowIndex}"]`);
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
export function attachTableHandleOverlay(
  wrapper: HTMLElement,
  _columnCount: number,
  view: EditorView,
  controller: TableActiveCellController,
  tableFrom: number,
  selectedColumnIndex: number | null,
  selectedRowIndex: number | null,
  getOnTableHandleMenuChange: () => OnTableHandleMenuChange | undefined
): HandlePositionTrackingHandle {
  function resolveTableElement(): HTMLTableElement | null {
    return wrapper.querySelector<HTMLTableElement>(':scope > .cm-table-scroll > table');
  }

  const tableEl = resolveTableElement();
  if (tableEl) {
    const headerRow = tableEl.rows[0];
    if (headerRow) {
      for (let c = 0; c < headerRow.children.length; c++) {
        createColumnHandlePair(wrapper, c, c === selectedColumnIndex);
      }
    }
    for (let r = 0; r < tableEl.rows.length; r++) {
      const firstCell = tableEl.rows[r]!.children[0] as HTMLElement | undefined;
      if (firstCell) {
        createRowHandlePair(wrapper, r, r === selectedRowIndex);
      }
    }
  }

  const columnDropIndicator = document.createElement('div');
  columnDropIndicator.className = 'cm-table-column-drop-indicator';
  const rowDropIndicator = document.createElement('div');
  rowDropIndicator.className = 'cm-table-row-drop-indicator';
  wrapper.append(columnDropIndicator, rowDropIndicator);

  /** Column N's own permanent handle — looked up by `data-column-index` now (`createColumnHandlePair`'s own doc comment), never by cell ancestry. */
  function columnHandlePair(columnIndex: number): HandlePair | null {
    return findColumnHandlePair(wrapper, columnIndex);
  }

  /**
   * Positions column `columnIndex`'s own handle pair against its header
   * cell's own *live* geometry — the direct replacement for the plain CSS
   * `position: relative`-on-`<th>` this handle relied on before moving out
   * of it (`createColumnHandlePair`'s own doc comment). `left` reproduces
   * the old `inset-inline-start: 50%` (centered on the cell), `top` the old
   * `top: -1px` (straddling the cell's own top border) — both now computed
   * in `wrapper`'s own coordinate space (`tableHandleOverlay.css`'s
   * `transform: translateX(-50%)` still does the final half-width
   * centering, unchanged, against whatever `left` is set to here). A no-op
   * when either the cell or the pair can't be resolved (a column that no
   * longer exists after a structural edit, or a render this table has no
   * handle for at all — `attachTableHandleOverlay`'s own `this.controller`
   * gate).
   */
  function positionColumnHandle(columnIndex: number): void {
    const headerRow = resolveTableElement()?.rows[0];
    const cell = headerRow?.children[columnIndex] as HTMLElement | undefined;
    const pair = findColumnHandlePair(wrapper, columnIndex);
    if (!cell || !pair) {
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const left = `${cellRect.left - wrapperRect.left + cellRect.width / 2}px`;
    const top = `${cellRect.top - wrapperRect.top - 1}px`;
    pair.hit.style.left = left;
    pair.hit.style.top = top;
    pair.visible.style.left = left;
    pair.visible.style.top = top;
  }

  /** Repositions every column's own handle pair — called whenever the table's own rendered geometry could have changed: initial mount, horizontal scroll, and any resize (`attachTableHandleOverlay`'s own call sites below have the specifics). */
  function positionAllColumnHandles(): void {
    const columnCount = resolveTableElement()?.rows[0]?.children.length ?? 0;
    for (let c = 0; c < columnCount; c++) {
      positionColumnHandle(c);
    }
  }

  /** Row N's own permanent handle — looked up by `data-row-index` now (`createRowHandlePair`'s own doc comment), never by cell ancestry. */
  function rowHandlePair(rowIndex: number): HandlePair | null {
    return findRowHandlePair(wrapper, rowIndex);
  }

  /**
   * Positions row `rowIndex`'s own handle pair against its own first
   * cell's *live* geometry — symmetric to `positionColumnHandle`, for the
   * identical "moved out of a clipping ancestor" reason
   * (`createRowHandlePair`'s own doc comment). `left` reproduces the old
   * `inset-inline-start: -1px` (straddling the cell's own left border),
   * `top` the old `top: 50%` (vertically centered on the cell) —
   * `tableHandleOverlay.css`'s own `transform: translateY(-50%)` still does
   * the final half-height centering, unchanged, against whatever `top` is
   * set to here.
   */
  function positionRowHandle(rowIndex: number): void {
    const row = resolveTableElement()?.rows[rowIndex];
    const cell = row?.children[0] as HTMLElement | undefined;
    const pair = findRowHandlePair(wrapper, rowIndex);
    if (!cell || !pair) {
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const left = `${cellRect.left - wrapperRect.left - 1}px`;
    const top = `${cellRect.top - wrapperRect.top + cellRect.height / 2}px`;
    pair.hit.style.left = left;
    pair.hit.style.top = top;
    pair.visible.style.left = left;
    pair.visible.style.top = top;
  }

  /** Repositions every row's own handle pair — same call sites as `positionAllColumnHandles`. */
  function positionAllRowHandles(): void {
    const rowCount = resolveTableElement()?.rows.length ?? 0;
    for (let r = 0; r < rowCount; r++) {
      positionRowHandle(r);
    }
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
    // A pointer over the column/row handle's own hit-box must read as
    // "still hovering whatever column/row this handle already represents"
    // — resolved directly from its own `data-column-index`/`data-row-index`
    // — never falls through to `resolveHoveredCell` below. Confirmed live
    // to be load-bearing, not defensive: both handles are direct children
    // of `wrapper` now (`createColumnHandlePair`/`createRowHandlePair`'s
    // own doc comments — moved out of their owning `<td>`/`<th>` to escape
    // `.cm-table-scroll`'s own forced clip), so `resolveHoveredCell`'s
    // `target.closest('td, th')` genuinely fails for them; without this
    // branch, entering the handle's own hit-box reads as "left every cell,"
    // hiding the handle, which immediately re-exposes the cell underneath
    // it, re-triggering this same handler and showing the handle again — an
    // endless show/hide loop for as long as the pointer sits still over it.
    // The icon/bar layered on top of the hit-box never steals `event.target`
    // from it (both inherit `pointer-events: none` from `.cm-table-column-
    // handle`/`.cm-table-row-handle`, `tableHandleOverlay.css`), so this one
    // check already covers hovering the visible three-dot button too, not
    // just the invisible hit-area around it.
    const columnHandleHit = closestHit(event.target, 'cm-table-column-handle-hit');
    if (columnHandleHit) {
      const columnIndex = Number(columnHandleHit.dataset.columnIndex);
      if (Number.isInteger(columnIndex)) {
        setVisibleColumn(columnHandlePair(columnIndex));
        setVisibleRow(selectedRowFallback());
        return;
      }
    }
    const rowHandleHit = closestHit(event.target, 'cm-table-row-handle-hit');
    if (rowHandleHit) {
      const rowIndex = Number(rowHandleHit.dataset.rowIndex);
      if (Number.isInteger(rowIndex)) {
        setVisibleRow(rowHandlePair(rowIndex));
        setVisibleColumn(selectedColumnFallback());
        return;
      }
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
   * **`'none'` — the divider between two columns is a neutral zone.**
   * Column resize's own hit-strip (`tableColumnResizeHandle.ts`'s
   * `.cm-table-column-resize-hit`, one per column at that column's own
   * right edge, `pointer-events: auto` unconditionally, real rendered
   * width) already sits exactly there — reusing it as the divider's own
   * real hit area, rather than picking a fresh threshold, is what "do not
   * invent arbitrary pixel offsets" asks for. `event.target` is real
   * native hit-testing (or, in tests, an explicitly simulated stand-in for
   * it — see this file's own test suite), so no separate geometry check
   * is needed: if the resize strip is what's under the pointer, it's what
   * `event.target` already reports. The pointer being over no real cell at
   * all (e.g. off the table's own edges) produces the identical `'none'`.
   *
   * `hoveredIndex` and `targetIndex` are the same number here — kept as
   * two separate fields (rather than collapsing `'target'` to one) purely
   * to match `DragTargetResolution`'s own shape and because
   * `updateColumnDropIndicator` reads it under the `hoveredIndex` name.
   */
  function resolveColumnTargetIndex(event: PointerEvent, startIndex: number): DragTargetResolution {
    const target = event.target;
    if (target instanceof Element && target.closest('.cm-table-column-resize-hit')) {
      return { kind: 'none' };
    }
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
    if (!hoveredCell) {
      columnDropIndicator.classList.remove(VISIBLE_CLASS);
      return;
    }
    const wrapperRect = wrapper.getBoundingClientRect();
    const cellRect = hoveredCell.getBoundingClientRect();
    const borderWidth = parseFloat(getComputedStyle(wrapper).borderLeftWidth) || 0;
    const edgeX = hoveredIndex < startIndex ? cellRect.left : cellRect.right;
    columnDropIndicator.style.left = `${edgeX - wrapperRect.left - borderWidth}px`;
    columnDropIndicator.classList.add(VISIBLE_CLASS);
  }

  /**
   * Symmetric to `updateColumnDropIndicator`, for the row axis — the
   * hovered row's own actual rendered **top** edge when it sits before the
   * dragged row (`hoveredIndex < startIndex`), its **bottom** edge
   * otherwise, real geometry throughout. Unlike the column indicator
   * (whose CSS `top: 0; bottom: 0` is always correct — a table's rendered
   * *height* never diverges from `wrapper`'s own, there being no per-row
   * equivalent of `tableColumnWidthMetadata.ts`'s persisted explicit
   * widths), this indicator's *span* also has to be set here, not left to
   * CSS: `wrapper` is always the editor's full width, but the `<table>`
   * itself can render narrower (an explicit, narrower persisted table
   * width) — a plain `left: 0; right: 0` would draw this line all the way
   * across `wrapper`, visibly wider than the table it's marking a boundary
   * inside of.
   */
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
  function startDragSession(axis: 'row' | 'column', startIndex: number, startClientX: number, startClientY: number): void {
    dragSession = { axis, startIndex, targetIndex: startIndex, startClientX, startClientY, dragging: false, ghost: null, restoreSource: null };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }

  /** Consumes this exact `tableFrom`'s own pending drag-resume entry, if one is still there, and starts tracking it against *this* instance's own (now-live) `wrapper` — see this file's own top doc comment, "Selection model," for why at most one of two possible call sites ever actually finds an entry here. */
  function resumePendingDragIfMine(): void {
    const pending = pendingDragResumeByTableFrom.get(tableFrom);
    if (!pending) {
      return;
    }
    pendingDragResumeByTableFrom.delete(tableFrom);
    startDragSession(pending.axis, pending.startIndex, pending.startClientX, pending.startClientY);
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
  // **Capture phase, not bubble — load-bearing.** A row handle lives
  // *inside* its own first cell (`createColumnHandlePair`'s own doc
  // comment explains why the *column* handle no longer does), and
  // `tableWidget.ts`'s own `buildRow()` already attaches its own
  // `mousedown` listener directly on every `<th>`/`<td>` (cell activation /
  // `beginCellDragTracking`). In the bubble phase, that cell-level
  // listener — closer to the actual target — fires *before* any
  // bubble-phase listener on `wrapper` ever would, so `stopPropagation()`
  // here would arrive too late to stop it. A capture-phase listener on
  // `wrapper` runs top-down, before any bubble-phase listener on a
  // descendant cell, so it reliably intercepts
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
    // Both handles are direct children of `wrapper` now
    // (`createColumnHandlePair`/`createRowHandlePair`'s own doc comments) —
    // `resolveHoveredCell`'s `target.closest('td, th')` can't reach an
    // owning cell from either, so each one's own `data-column-index`/
    // `data-row-index` resolves it directly instead.
    let startIndex: number;
    if (columnHit) {
      const columnIndex = Number(columnHit.dataset.columnIndex);
      if (!Number.isInteger(columnIndex)) {
        return;
      }
      startIndex = columnIndex;
    } else {
      const rowIndex = Number(rowHit!.dataset.rowIndex);
      if (!Number.isInteger(rowIndex)) {
        return;
      }
      startIndex = rowIndex;
    }
    suppressNextClick = false;
    const selection = axis === 'row' ? ({ kind: 'row' as const, tableFrom, rowIndex: startIndex }) : ({ kind: 'column' as const, tableFrom, columnIndex: startIndex });
    controller.deactivate();
    // A genuine selection change (this handle's row/column wasn't already
    // the sole selection) makes `TableWidget.eq()` rebuild the whole widget
    // below — this file's own top doc comment, "Selection model" — and that
    // rebuild replaces `.cm-table-scroll` with a fresh element that starts
    // at `scrollLeft` 0, exactly the same underlying cause `tableWidget.ts`'s
    // own `pendingScrollRestoreByTableFrom` doc comment already documents
    // for a cell click. Captured here, before dispatch, for the same reason
    // that comment gives; handed off the same way (`tableWidget.ts`'s own
    // `toDOM()` picks it up and passes it on to
    // `attachTableColumnResizeHandles()`, which restores it only once its
    // own `positionBoundaries()` microtask has actually run).
    const currentScroll = view.dom.querySelector<HTMLElement>(
      `.cm-table-widget[data-table-from="${tableFrom}"] .cm-table-wrapper > .cm-table-scroll`
    );
    if (currentScroll) {
      setPendingTableScrollRestore(tableFrom, currentScroll.scrollLeft);
    }
    // Set *before* dispatching — a rebuild this dispatch triggers runs
    // synchronously, inside `dispatch()`, and its own fresh
    // `attachTableHandleOverlay` call may already consume this entry before
    // `dispatch()` even returns below.
    pendingDragResumeByTableFrom.set(tableFrom, { axis, startIndex, startClientX: pe.clientX, startClientY: pe.clientY });
    view.dispatch({
      effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of(selection)],
      ...getRootSelectionCollapse(view),
    });
    view.focus();
    // Still here only if the dispatch above did *not* rebuild this widget
    // (`TableWidget.eq()` reported no change — this handle's row/column was
    // already the sole selection) — this exact closure/`wrapper` is still
    // the live one, so resume tracking the possible drag right here.
    resumePendingDragIfMine();
  });

  /** This exact table's own fresh `.cm-table-wrapper` — both handles' own actual parent now (`createColumnHandlePair`/`createRowHandlePair`'s own doc comments) — resolved from `view.dom` by `tableFrom`, never a closure-captured reference, since a click's own dispatch synchronously rebuilds this widget. */
  function resolveFreshWrapper(): HTMLElement | null {
    return view.dom.querySelector<HTMLElement>(`.cm-table-widget[data-table-from="${tableFrom}"] > .cm-table-wrapper`);
  }

  function resolveFreshColumnHandle(columnIndex: number): HTMLElement | null {
    const freshWrapper = resolveFreshWrapper();
    return freshWrapper ? findColumnHandlePair(freshWrapper, columnIndex)?.visible ?? null : null;
  }

  function resolveFreshRowHandle(rowIndex: number): HTMLElement | null {
    const freshWrapper = resolveFreshWrapper();
    return freshWrapper ? findRowHandlePair(freshWrapper, rowIndex)?.visible ?? null : null;
  }

  // Click-to-open-menu. `click` fires whenever mousedown+mouseup land on
  // (or near) the same element — true for an ordinary press/release *and*
  // for a completed drag that happened to release back over its own
  // handle, so each branch below checks `suppressNextClick` first (set by
  // `handlePointerUp` the instant a real drag commits) before doing
  // anything else. The `mousedown` listener above still guarantees neither
  // a click nor a drag can ever reach root CM6 or the nested cell editor.
  //
  // Selection itself is never dispatched here — the pointerdown handler
  // above already did that, unconditionally, before this same gesture's
  // `click` even fires (this file's own top doc comment, "Selection
  // model"). This handler's only remaining job is opening/updating the
  // handle menu for a *plain* click (never a completed drag).
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
      // `resolveHoveredCell`'s own `target.closest('td, th')` can no longer
      // reach an owning cell from here — `columnHit` is a direct child of
      // `wrapper` now (`createColumnHandlePair`'s own doc comment) — so the
      // column index comes straight off the `data-column-index` this exact
      // element was stamped with at creation instead.
      const columnIndex = Number(columnHit.dataset.columnIndex);
      if (!Number.isInteger(columnIndex)) {
        return;
      }
      const selection = { kind: 'column' as const, tableFrom, columnIndex };
      const freshAnchor = resolveFreshColumnHandle(columnIndex);
      if (freshAnchor) {
        getOnTableHandleMenuChange()?.({ anchor: freshAnchor, selection });
      }
      return;
    }
    if (rowHit) {
      // `rowHit` is a direct child of `wrapper` now (`createRowHandlePair`'s
      // own doc comment) — its own `data-row-index` resolves it directly,
      // the same reason the column branch just above reads
      // `data-column-index` instead of `resolveHoveredCell`.
      const rowIndex = Number(rowHit.dataset.rowIndex);
      if (!Number.isInteger(rowIndex)) {
        return;
      }
      const selection = { kind: 'row' as const, tableFrom, rowIndex };
      const freshAnchor = resolveFreshRowHandle(rowIndex);
      if (freshAnchor) {
        getOnTableHandleMenuChange()?.({ anchor: freshAnchor, selection });
      }
    }
  });

  // Initial state — this widget may be freshly (re)built with a
  // `TableSelection` already set and no hover having occurred yet on this
  // exact DOM instance. Visibility itself is safe to set synchronously
  // (pure class toggling), but *position* now needs real measurement
  // (`positionColumnHandle`/`positionRowHandle` — both handles moved out of
  // their owning cells, `createColumnHandlePair`/`createRowHandlePair`'s own
  // doc comments), deferred below the same way every other geometry read in
  // this feature already is.
  setVisibleColumn(selectedColumnFallback());
  setVisibleRow(selectedRowFallback());

  // If this exact `tableFrom`'s own pointerdown handler just dispatched a
  // selection change that rebuilt the widget, its own pending drag-resume
  // entry is still there — this fresh instance's own `wrapper` is now the
  // live one, so pick the drag session back up here (this file's own top
  // doc comment, "Selection model," has the full reasoning).
  resumePendingDragIfMine();

  return attachHandlePositionTracking(wrapper, resolveTableElement, positionAllColumnHandles, positionAllRowHandles);
}

/**
 * Keeps every column/row handle's own JS-computed position current — the
 * direct consequence of `createColumnHandlePair`/`createRowHandlePair`
 * moving both out of their owning cells (their own doc comments have the
 * full "why"): nothing about a handle's position is free from ordinary
 * block flow anymore, so this module now owns keeping it in sync with
 * whatever can change it.
 *
 * - **Initial mount** — deferred one microtask, mirroring every other
 *   geometry read in this feature (`tableColumnResizeHandle.ts`'s own
 *   `positionBoundaries()`, `tableWidgetBreakoutWidth.ts`'s own first
 *   measurement): `wrapper` is not yet attached to the live document at the
 *   point `TableWidget.toDOM()` calls this, so `getBoundingClientRect()`
 *   against any header/first cell would be meaningless. `wrapper.isConnected`
 *   re-checked at fire time for the same reason those call sites already
 *   re-check it.
 * - **Horizontal scroll** — a plain `scroll` listener on `.cm-table-scroll`.
 *   Neither handle is a descendant of it anymore (that's the entire point —
 *   `.cm-table-scroll` is exactly the box that used to clip them), so
 *   neither tracks the table's own horizontal pan for free the way an
 *   ordinary scrolled descendant would; this listener is what replaces that.
 * - **Resize** — a `ResizeObserver` on `table` itself, the same "observe the
 *   real geometry source" idiom `tableSelectionOverlay.ts`'s own
 *   `attachTableSelectionOverlayResize` already uses. Catches a live
 *   column-resize drag (which shifts every header cell to the right of the
 *   dragged one, live, well before any commit/rebuild), a completed resize,
 *   a row growing/shrinking, and a window resize's own downstream effect on
 *   the table-widget breakout width — all through one mechanism, none of
 *   them requiring their own separate listener.
 *
 * Returns a disposable handle so `TableWidget` can disconnect the
 * `ResizeObserver` in its own `destroy()`, exactly like its existing
 * selection-overlay and breakout-width observers — a plain `scroll`
 * listener needs no equivalent teardown (it's bound to `.cm-table-scroll`,
 * itself discarded along with `wrapper` on every rebuild, the same "per-
 * render listener, no `destroy()` needed" category every other listener in
 * this file already falls into).
 */
export interface HandlePositionTrackingHandle {
  disconnect(): void;
}

function attachHandlePositionTracking(
  wrapper: HTMLElement,
  resolveTableElement: () => HTMLTableElement | null,
  positionAllColumnHandles: () => void,
  positionAllRowHandles: () => void
): HandlePositionTrackingHandle {
  const positionAll = (): void => {
    positionAllColumnHandles();
    positionAllRowHandles();
  };

  let observer: ResizeObserver | null = null;
  let disconnected = false;

  queueMicrotask(() => {
    if (disconnected || !wrapper.isConnected) {
      return;
    }
    positionAll();
    const tableScroll = wrapper.querySelector<HTMLElement>(':scope > .cm-table-scroll');
    tableScroll?.addEventListener('scroll', positionAll);
    const tableEl = resolveTableElement();
    if (tableEl && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(positionAll);
      observer.observe(tableEl);
    }
  });

  return {
    disconnect(): void {
      disconnected = true;
      observer?.disconnect();
      observer = null;
    },
  };
}
