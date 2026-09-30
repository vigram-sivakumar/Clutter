import './tableDragGhost.css';
// Side-effect import, not a new stylesheet of our own for this part — the
// ghost's own border reuses `.cm-table-selection-overlay`'s exact rule
// (`border: 2px solid var(--border-focus)`, border-only/no-fill per that
// file's own 2026-09-29 revert) verbatim, per this module's own doc
// comment below on why. Importing here guarantees the class exists
// regardless of module load order, even though `tableWidget.ts`'s own
// table-rendering path already loads it by the time any drag can happen.
import './tableSelectionOverlay.css';

/**
 * Drag-to-reorder visual feedback — the floating "ghost" that represents
 * the column/row currently being dragged, plus the companion helpers that
 * visually hide the original column's/row's content for the duration of
 * that drag. New in this milestone; no historical implementation to
 * recover, so scoped tightly to exactly what `tableHandleOverlay.ts`'s own
 * drag session needs, nothing more.
 *
 * **Three independent visual concepts, never merged** (see this module's
 * own callers): the selection overlay (what's selected —
 * `tableSelectionOverlay.ts`, untouched here, still border-only per
 * `var(--border-focus)`), the drag ghost (what's being moved — this
 * module), and the drop indicator (where it will land —
 * `tableHandleOverlay.ts`'s own `updateColumnDropIndicator`/
 * `updateRowDropIndicator`, untouched). Each is a separate DOM element with
 * a separate job.
 *
 * **Mounting point.** Every element this module creates is appended as a
 * direct child of `wrapper` (`.cm-table-wrapper`) — the same positioning
 * context `tableHandleOverlay.ts`'s own drop indicators already use, for
 * the identical reason: `position: absolute` against `wrapper` (not
 * `.cm-table-scroll`) means the ghost is never subject to that container's
 * own `overflow-x: auto` clipping, and its own JS-computed pixel offsets
 * (below) never need to account for the table's internal horizontal
 * scroll position at all — they're derived directly from the pointer's own
 * viewport coordinates each time, so an in-progress horizontal scroll
 * simply has no bearing on where the ghost renders.
 *
 * **Content.** Each ghost cell clones the *rendered* `.cm-table-cell-wrapper`
 * markup (`innerHTML`, not the live node) of the corresponding real cell —
 * never the `<th>`/`<td>` itself, which would also duplicate that cell's
 * own handle pair (`cm-table-column-handle`/`cm-table-row-handle`) into
 * the ghost, confusing every handle-lookup in `tableHandleOverlay.ts` that
 * queries `wrapper` for exactly one instance per column/row. A clone of
 * static, already-rendered HTML is never a live `EditorView` — even for a
 * column/row that happens to contain the currently-active cell, the clone
 * is inert markup, not a second nested editor.
 *
 * **Geometry, not assumption.** Every dimension here comes from a live
 * `getBoundingClientRect()` read (the header cell's own width for a
 * column, each row's own real rendered height, the table's own real
 * width/height) — never a percentage or an assumed equal division, because
 * explicit (resized, uneven) column widths are a real, common case this
 * feature already supports (`tableColumnWidthMetadata.ts`).
 *
 * **The ghost visually represents "the selected region being moved," not
 * just its content** — it carries the *exact same* selection-border classes
 * `tableSelectionOverlay.css`'s own `.cm-table-selection-overlay` already
 * defines (`border: 2px solid var(--border-focus)`, border-only, no fill,
 * per that file's own 2026-09-29 revert), reused verbatim rather than a
 * second, parallel "selected" visual invented here — and one cloned handle
 * bar (`.cm-table-column-handle`/`.cm-table-row-handle`, the exact same
 * class the real, structural per-column/per-row handle already uses,
 * `tableHandleOverlay.css`), representing the dragged column's/row's own
 * handle, now visually attached to the ghost instead of its original cell.
 * This clone is decorative only — `pointer-events: none` throughout the
 * ghost (`tableDragGhost.css`) — the drag itself is still driven entirely
 * by `tableHandleOverlay.ts`'s own `document`-level pointer listeners,
 * never by anything on this clone.
 */

const HIDDEN_SOURCE_CLASS = 'cm-table-drag-source-hidden';

/**
 * Visually hides (via `visibility: hidden`, not `display: none`) every
 * cell-wrapper in `columnIndex` across `table`'s own rows — never removes
 * a cell from the DOM, never touches document/source state, and never
 * changes column width (`visibility: hidden` still reserves the box it
 * hides; only `.cm-table-cell-wrapper`'s own content disappears, not the
 * owning `<th>`/`<td>`'s own border/background, and never the handle pair
 * living alongside it — handles are siblings of the wrapper, not
 * descendants, so hiding the wrapper alone never touches them). Returns a
 * restore function that undoes exactly this, and only this.
 */
export function hideColumnSourceContent(table: HTMLTableElement, columnIndex: number): () => void {
  const hidden: HTMLElement[] = [];
  for (let r = 0; r < table.rows.length; r++) {
    const cell = table.rows[r]!.children[columnIndex] as HTMLElement | undefined;
    const cellWrapper = cell?.querySelector<HTMLElement>(':scope > .cm-table-cell-wrapper');
    if (cellWrapper) {
      cellWrapper.classList.add(HIDDEN_SOURCE_CLASS);
      hidden.push(cellWrapper);
    }
  }
  return () => hidden.forEach((el) => el.classList.remove(HIDDEN_SOURCE_CLASS));
}

/** Symmetric to `hideColumnSourceContent`, for a single row's own cells. */
export function hideRowSourceContent(row: HTMLTableRowElement): () => void {
  const hidden: HTMLElement[] = [];
  for (let c = 0; c < row.children.length; c++) {
    const cellWrapper = row.children[c]!.querySelector<HTMLElement>(':scope > .cm-table-cell-wrapper');
    if (cellWrapper) {
      cellWrapper.classList.add(HIDDEN_SOURCE_CLASS);
      hidden.push(cellWrapper);
    }
  }
  return () => hidden.forEach((el) => el.classList.remove(HIDDEN_SOURCE_CLASS));
}

export interface DragGhost {
  /** The ghost's own root element — exposed for tests and defensive callers; `tableHandleOverlay.ts` itself only ever needs `update`/`destroy`. */
  readonly element: HTMLElement;
  /** Re-measures `wrapper` fresh (never cached — the caller already does this for the drop indicator on every move, this mirrors that) and moves the ghost along its one permitted axis. The other axis is never touched after creation. */
  readonly update: (clientPos: number, wrapperRect: DOMRect) => void;
  /** Removes the ghost element. Safe to call even if the element (or one of its ancestors) was already detached from the document — `Element.remove()` is a no-op in that case, never a throw, so a table rebuild mid-drag (see this module's own top doc comment on lifecycle) needs no special-case handling here. */
  readonly destroy: () => void;
}

function buildGhostCell(sourceCell: Element | undefined, isHeaderCell: boolean): HTMLElement {
  const ghostCell = document.createElement('div');
  ghostCell.className = isHeaderCell ? 'cm-table-drag-ghost-cell cm-table-drag-ghost-cell--header' : 'cm-table-drag-ghost-cell';
  const sourceWrapper = sourceCell?.querySelector(':scope > .cm-table-cell-wrapper');
  if (sourceWrapper) {
    ghostCell.innerHTML = sourceWrapper.innerHTML;
  }
  return ghostCell;
}

/**
 * The ghost's own inner clipping layer — every ghost cell lives inside
 * this, never as a direct child of the ghost's own root element. Keeps
 * cell-content clipping (long text, the shape's own rounded corners)
 * entirely separate from the root's own `overflow: visible`, which the
 * handle clone (a *sibling* of this container, appended straight onto the
 * root — see each `create*DragGhost`'s own call site) structurally
 * depends on to paint its own intentional outside-the-box poke without
 * being clipped. See `tableDragGhost.css`'s own doc comment on
 * `.cm-table-drag-ghost` for the full reasoning.
 */
function createGhostContent(): HTMLElement {
  const content = document.createElement('div');
  content.className = 'cm-table-drag-ghost-content';
  return content;
}

/**
 * Creates the floating column ghost and mounts it into `wrapper`, already
 * positioned for the drag's own current pointer position. `grabClientX` is
 * the drag's *original* press-time `clientX` (`DragSession.startClientX`
 * in `tableHandleOverlay.ts`), used only to compute the fixed grab offset
 * — "preserve the original grab offset" means the offset itself must never
 * drift from wherever the user first pressed, even though ghost creation
 * itself is deferred to the moment the drag threshold is actually crossed
 * (a few pixels of pointer travel later). `currentClientX` (that later
 * event's own `clientX`) is used only for the ghost's *initial* placement,
 * so it appears already tracking correctly with no visible jump, as if it
 * had existed since the press.
 */
export function createColumnDragGhost(wrapper: HTMLElement, table: HTMLTableElement, columnIndex: number, grabClientX: number, currentClientX: number): DragGhost {
  const headerCell = table.rows[0]?.children[columnIndex] as HTMLElement | undefined;
  const cellRect = (headerCell ?? table).getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const wrapperRectAtCreation = wrapper.getBoundingClientRect();

  const element = document.createElement('div');
  // `cm-table-selection-overlay cm-table-selection-overlay-visible` reused
  // verbatim (this file's own top doc comment) for the border; never just
  // `cm-table-selection-overlay` alone, since that class's own default
  // `visibility: hidden` exists only to cover the gap between "appended"
  // and "positioned" that `tableSelectionOverlay.ts` has to deal with —
  // this element is always positioned before it's ever visible, so no such
  // gap exists here.
  element.className = 'cm-table-drag-ghost cm-table-drag-ghost--column cm-table-selection-overlay cm-table-selection-overlay-visible';
  element.style.width = `${cellRect.width}px`;
  element.style.height = `${tableRect.height}px`;
  // Top is set exactly once, here, and never touched again — "NEVER moves
  // vertically" for a column ghost.
  element.style.top = `${tableRect.top - wrapperRectAtCreation.top}px`;

  const content = createGhostContent();
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r]!;
    const cell = row.children[columnIndex] as HTMLElement | undefined;
    const rowRect = row.getBoundingClientRect();
    const ghostCell = buildGhostCell(cell, r === 0);
    // Each ghost row's own real rendered height, not an equal division —
    // rows are content-driven (`tableHandleOverlay.css`'s own reasoning
    // for the row handle applies identically here).
    ghostCell.style.flexBasis = `${rowRect.height}px`;
    content.appendChild(ghostCell);
  }
  element.appendChild(content);

  // The dragged column's own handle, visually relocated onto the ghost —
  // a *sibling* of `content` (never inside it — that's the clipping
  // container), appended last onto the root so it paints above both the
  // cloned cell content and this element's own selection-overlay border
  // (`tableDragGhost.css`'s own doc comment has the full paint-order
  // reasoning). Absolutely positioned (`.cm-table-column-handle`'s own
  // CSS, `tableHandleOverlay.css`) against this root element itself.
  //
  // Cloned from `wrapper`'s own real, currently-rendered handle for this
  // column (`tableHandleOverlay.ts`'s own `createColumnHandlePair`,
  // three-dot icon included) rather than rebuilt from scratch, so the
  // ghost's handle can never drift out of sync with what the real handle
  // actually looks like. `wrapper`'s own direct child now, not the header
  // cell's — see that function's own doc comment for why the column handle
  // no longer lives inside its `<th>` at all. Falls back to a bare div when
  // no real handle exists yet to clone from (this module's own unit tests
  // build a table without ever attaching the real overlay).
  const realHandle = wrapper.querySelector<HTMLElement>(`:scope > .cm-table-column-handle[data-column-index="${columnIndex}"]`);
  const handle = realHandle ? (realHandle.cloneNode(true) as HTMLElement) : document.createElement('div');
  handle.className = 'cm-table-column-handle cm-table-handle-visible';
  // The real handle's own `left`/`top` are absolute pixel values computed
  // against `.cm-table-wrapper`'s own coordinate space
  // (`tableHandleOverlay.ts`'s own `positionColumnHandle`) — meaningless
  // (and wrong) once cloned onto this element's own, entirely different
  // absolutely-positioned box. Reset to the same "centered on top edge"
  // placement `tableHandleOverlay.css`'s own (now cell-relative-only)
  // column-handle rule used to give for free before the handle moved out of
  // its `<th>` — `transform: translateX(-50%)` (that file's own static
  // rule, untouched) still does the final half-width centering.
  handle.style.left = '50%';
  handle.style.top = '-1px';
  element.appendChild(handle);

  wrapper.appendChild(element);

  const grabOffset = grabClientX - cellRect.left;
  const update = (clientX: number, wrapperRect: DOMRect): void => {
    element.style.left = `${clientX - grabOffset - wrapperRect.left}px`;
  };
  update(currentClientX, wrapperRectAtCreation);

  return { element, update, destroy: () => element.remove() };
}

/** Symmetric to `createColumnDragGhost`, for the row axis — width/left fixed at creation ("NEVER moves horizontally"), height/top track the pointer's own Y. */
export function createRowDragGhost(wrapper: HTMLElement, table: HTMLTableElement, rowIndex: number, grabClientY: number, currentClientY: number): DragGhost {
  const row = table.rows[rowIndex];
  const rowRect = (row ?? table).getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const wrapperRectAtCreation = wrapper.getBoundingClientRect();

  const element = document.createElement('div');
  element.className = 'cm-table-drag-ghost cm-table-drag-ghost--row cm-table-selection-overlay cm-table-selection-overlay-visible';
  element.style.height = `${rowRect.height}px`;
  element.style.width = `${tableRect.width}px`;
  element.style.left = `${tableRect.left - wrapperRectAtCreation.left}px`;

  const content = createGhostContent();
  const cellCount = row?.children.length ?? 0;
  for (let c = 0; c < cellCount; c++) {
    const cell = row!.children[c] as HTMLElement;
    const cellRect = cell.getBoundingClientRect();
    const ghostCell = buildGhostCell(cell, rowIndex === 0);
    // Each ghost cell's own real rendered width, not an equal division —
    // explicit column widths are a real, supported case.
    ghostCell.style.flexBasis = `${cellRect.width}px`;
    content.appendChild(ghostCell);
  }
  element.appendChild(content);

  // The dragged row's own handle, visually relocated onto the ghost — see
  // `createColumnDragGhost`'s own identical comment on why it's a sibling
  // of `content`, appended last onto the root, and on why it's cloned from
  // the real one (icon included) rather than rebuilt from scratch. `wrapper`'s
  // own direct child now, not the first cell's — `tableHandleOverlay.ts`'s
  // own `createRowHandlePair` doc comment has the full reasoning.
  const realRowHandle = wrapper.querySelector<HTMLElement>(`:scope > .cm-table-row-handle[data-row-index="${rowIndex}"]`);
  const handle = realRowHandle ? (realRowHandle.cloneNode(true) as HTMLElement) : document.createElement('div');
  handle.className = 'cm-table-row-handle cm-table-handle-visible';
  // Reset to the cell-relative placement this handle used to get for free
  // — see `createColumnDragGhost`'s own identical reset just above for the
  // full reasoning (`left`/`top` cloned from the real handle are absolute
  // pixels against `.cm-table-wrapper`'s own coordinate space, meaningless
  // once cloned onto this element's own, different absolutely-positioned
  // box). `transform: translateY(-50%)` (`tableHandleOverlay.css`'s own
  // static rule, untouched) still does the final half-height centering.
  handle.style.left = '-1px';
  handle.style.top = '50%';
  element.appendChild(handle);

  wrapper.appendChild(element);

  const grabOffset = grabClientY - rowRect.top;
  const update = (clientY: number, wrapperRect: DOMRect): void => {
    element.style.top = `${clientY - grabOffset - wrapperRect.top}px`;
  };
  update(currentClientY, wrapperRectAtCreation);

  return { element, update, destroy: () => element.remove() };
}
