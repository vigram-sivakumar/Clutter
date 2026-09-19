import './tableHandleOverlay.css';

/**
 * Column/row hover-handle overlay (visual + hover only — click, drag,
 * reorder, and any `TableSelection` state are a later milestone, not
 * implemented here). One reusable element pair per axis (not one per
 * column/row), repositioned on hover — the same "one reusable instance,
 * repositioned rather than recreated per target" shape
 * `TableActiveCellController` already establishes for the nested cell
 * editor, applied here to a much lighter piece of UI state.
 *
 * Lives outside `<table>`'s own cell DOM entirely — appended as a sibling
 * of `.cm-table-scroll` inside `.cm-table-wrapper` (`tableWidget.ts`'s own
 * `toDOM()`) — so it can never be mistaken for cell content by the
 * per-cell `mousedown` → `controller.activate()` path, and can visually
 * extend past `.cm-table-wrapper`'s own border (the whole point of this
 * overlay) without needing any change to the table's own layout.
 *
 * Attached fresh on every `TableWidget.toDOM()` call, with no persisted
 * instance and no explicit `destroy()` — the same lifecycle every other
 * per-render listener in this file's sibling module already uses (e.g.
 * `tableWidget.ts`'s own per-cell `mousedown` listeners, recreated on
 * every rebuild): CM6 discards the whole previous widget's DOM subtree
 * (listeners included) whenever `eq()` says rebuild, so there is nothing
 * here to leak or manually tear down.
 */

const VISIBLE_CLASS = 'cm-table-handle-visible';

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

function createHandlePair(axis: 'column' | 'row'): HandlePair {
  const hit = document.createElement('div');
  hit.className = `cm-table-${axis}-handle-hit`;
  const visible = document.createElement('div');
  visible.className = `cm-table-${axis}-handle`;
  return { hit, visible };
}

function hide(pair: HandlePair): void {
  pair.hit.classList.remove(VISIBLE_CLASS);
  pair.visible.classList.remove(VISIBLE_CLASS);
}

/**
 * Isolates the handle from both the nested cell editor and root CM6's own
 * cursor placement — no selection/drag behavior yet (a later milestone);
 * this only guarantees hovering/pressing a handle can never activate a
 * cell or move the root caret. Mirrors the exact `preventDefault` +
 * `stopPropagation` pairing `tableWidget.ts`'s own per-cell `mousedown`
 * handler and its widget-level non-cell suppression already use, for the
 * identical reason: stop root CM6's own `contentDOM` mousedown handling,
 * further up this same DOM tree, from also running.
 */
function preventActivation(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Attaches the hover-driven column/row handle overlay to `wrapper`
 * (`.cm-table-wrapper`). `columnCount` is the table's own header column
 * count (`TableWidget.headerCells.length`) — column position is computed
 * from it directly (`table-layout: fixed` with no explicit widths divides
 * columns evenly, per `tableWidget.css`'s own doc comment), needing no
 * `getBoundingClientRect()` call at all. Row position, by contrast, is
 * measured fresh against the hovered row every time — row height is
 * content-driven (see the active/inactive cell height-matching comments
 * already in `tableWidget.css`), not statically computable the way column
 * width is.
 */
export function attachTableHandleOverlay(wrapper: HTMLElement, columnCount: number): void {
  const column = createHandlePair('column');
  const row = createHandlePair('row');
  wrapper.append(column.hit, column.visible, row.hit, row.visible);

  column.hit.addEventListener('mousedown', preventActivation);
  row.hit.addEventListener('mousedown', preventActivation);

  function showColumn(columnIndex: number): void {
    const leftPercent = ((columnIndex + 0.5) / columnCount) * 100;
    column.hit.style.left = `${leftPercent}%`;
    column.visible.style.left = `${leftPercent}%`;
    column.hit.classList.add(VISIBLE_CLASS);
    column.visible.classList.add(VISIBLE_CLASS);
  }

  function showRow(rowElement: HTMLTableRowElement): void {
    const wrapperRect = wrapper.getBoundingClientRect();
    const rowRect = rowElement.getBoundingClientRect();
    const borderWidth = parseFloat(getComputedStyle(wrapper).borderTopWidth) || 0;
    const topPx = rowRect.top - wrapperRect.top - borderWidth + rowRect.height / 2;
    row.hit.style.top = `${topPx}px`;
    row.visible.style.top = `${topPx}px`;
    row.hit.classList.add(VISIBLE_CLASS);
    row.visible.classList.add(VISIBLE_CLASS);
  }

  wrapper.addEventListener('pointermove', (event) => {
    const target = event.target;
    // The handle's own hit-area is a sibling of the table, not a cell —
    // once shown, it visually sits on top of (or just outside) the cell
    // that triggered it, so the pointer reaching it to actually interact
    // with it makes *it* the event target, not any `<td>`/`<th>`.
    // Without this guard, `resolveHoveredCell` below would report "not
    // hovering any cell" the instant the pointer reached the handle it was
    // moving toward, hiding it — which drops `pointer-events` back to
    // `none`, so the *next* `pointermove` tick falls through to the cell
    // underneath again, re-showing it, immediately re-triggering the same
    // hide — an infinite show/hide flicker confirmed via direct
    // interactive testing. Reaching either hit-area is simply "still
    // hovering whatever this handle is already showing" — leave both
    // handles exactly as they are.
    if ((target instanceof Node && column.hit.contains(target)) || (target instanceof Node && row.hit.contains(target))) {
      return;
    }
    const hovered = resolveHoveredCell(wrapper, target);
    if (!hovered) {
      hide(column);
      hide(row);
      return;
    }
    showColumn(hovered.columnIndex);
    if (hovered.isHeaderRow) {
      // Header row: column handle only. Row selection/reorder explicitly
      // excludes the header — and the delimiter/alignment row, which never
      // renders as its own `<tr>` in this widget at all (`TableWidget`'s
      // own doc comment), so it needs no handling here either.
      hide(row);
    } else {
      showRow(hovered.row);
    }
  });

  wrapper.addEventListener('pointerleave', () => {
    hide(column);
    hide(row);
  });
}
