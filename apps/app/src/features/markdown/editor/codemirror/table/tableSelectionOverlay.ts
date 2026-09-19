import './tableSelectionOverlay.css';

const OVERLAY_CLASS = 'cm-table-selection-overlay';
const VISIBLE_CLASS = 'cm-table-selection-overlay-visible';

/**
 * Creates the (as yet unpositioned, invisible) column-selection outline
 * element. Synchronous and side-effect-free — safe to call and append
 * directly inside `TableWidget.toDOM()`, unlike `positionColumnSelectionOverlay`
 * below, which needs real layout and therefore cannot run until the
 * element is actually attached to the live document (see that function's
 * own doc comment for why). Starts invisible (`visibility: hidden`,
 * `tableSelectionOverlay.css`) specifically so there is nothing to see
 * during the gap between being appended and being positioned — without
 * that, the overlay would flash at its own default (near-zero) box for
 * one frame before the deferred positioning call corrects it.
 */
export function createTableSelectionOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  return overlay;
}

/**
 * Measures `table`'s own `selectedColumnIndex` column and positions
 * `overlay` (already appended into `scrollContainer`, i.e. `.cm-table-scroll`
 * — see `createTableSelectionOverlay`'s own doc comment) to outline it,
 * then reveals it. Does nothing (leaves `overlay` invisible) if that
 * column's own bounding cells can't be resolved — defensive only:
 * `selectedColumnIndex` is already validated against the header's own
 * current column count by `tableSelection.ts`'s own remap logic before
 * it can ever reach here; see this function's own "ragged rows"
 * paragraph for the one case it still needs to handle itself.
 *
 * **Must be called only after `overlay`/`table`/`scrollContainer` are
 * genuinely attached to the live document — never synchronously inside
 * `TableWidget.toDOM()` itself.** `toDOM()` builds a detached DOM subtree
 * that CM6 inserts into the document only *after* the method returns
 * (this file's own construction mirrors the exact same constraint
 * `TableWidget.toDOM()`'s own "M5 preserve focus across rebuilds" comment
 * already documents for the nested cell editor) — every
 * `getBoundingClientRect()` call in this function returns a degenerate,
 * meaningless rect for a still-detached element, which is not a
 * hypothetical concern: it is exactly the bug this two-function split
 * exists to fix (confirmed directly, live-browser: computing geometry
 * inline inside `toDOM()` produced a tiny, mispositioned overlay every
 * time). Callers must defer this call with `queueMicrotask()` — by which
 * point the synchronous `dispatch()` that triggered this rebuild has
 * already inserted the new DOM into the document — and should re-check
 * `overlay.isConnected` at fire time first, the same defensive re-check
 * `toDOM()`'s own focus-restoration microtask already performs, in case a
 * second, unrelated rebuild has since discarded this exact widget
 * instance.
 *
 * **A single overlay element, not per-cell borders/box-shadows** — the
 * explicit architectural requirement this module exists to satisfy: the
 * same rectangle-from-selected-cells approach must extend to a row
 * outline and a rectangular multi-cell range later (differently-shaped
 * rectangles, still one element, still this same function's own geometry
 * math), which per-cell styling cannot express without becoming exactly
 * the "grid of individual cell borders" this design deliberately avoids.
 *
 * **Coordinate space — why `scrollContainer` (`.cm-table-scroll`), not
 * `.cm-table-wrapper` the way the column/row hover handles are
 * anchored.** The hover handles are allowed to stay visually pinned
 * regardless of horizontal scroll — an accepted trade-off from that
 * milestone (`tableHandleOverlay.ts`'s own doc comment) — but this
 * overlay must track the actual column *through* scrolling (this
 * milestone's own explicit requirement). The only way an absolutely-
 * positioned element scrolls together with sibling content is by being a
 * fellow child of the *same* scrolling container (`.cm-table-scroll`, a
 * plain sibling of `<table>` here), positioned in that container's own
 * unscrolled *content* coordinate space — not the currently-visible
 * viewport. `scrollContainer` must already be `position: relative`
 * (`tableWidget.css`'s own `.cm-table-scroll` rule) for this to work at
 * all; this function does not set that itself.
 *
 * `left/top = cellRect - scrollContainerRect + scrollContainer.scrollLeft/Top`
 * is the standard conversion from a viewport-relative
 * `getBoundingClientRect()` reading to that scroll-independent content
 * offset: at the current scroll position, a point's content-relative
 * offset equals its viewport-relative offset from the scroll container's
 * own edge, plus however far the container is already scrolled.
 * Recomputed fresh on every call (every actual `TableWidget` rebuild,
 * i.e. whenever the selected column itself or the table's own layout
 * changes) — never cached across scroll events, since native scrolling
 * of `.cm-table-scroll` already moves this element correctly on its own
 * (it is real DOM content of that scrolling container, not a fixed
 * overlay reprojected on each scroll tick).
 *
 * **Cell geometry directly, not a new geometry abstraction.** Reuses the
 * already-rendered `<th>`/`<td>` boxes: `table-layout: fixed`
 * (`tableWidget.css`'s own doc comment) guarantees every row's Nth
 * column shares the same left/right pixel bounds, so only the header
 * cell's own rect is needed for the horizontal extent; the vertical
 * extent spans from the header's own top to the bounding column cell's
 * own bottom. No `tableGeometry.ts` involvement — that module resolves
 * Markdown *source positions*, never pixel geometry, by its own explicit
 * design (its own doc comment).
 *
 * **Ragged rows.** GFM tolerates a data row with fewer cells than the
 * header (`TableWidget`'s own doc comment: "rendered as-is, no padding to
 * a rectangular grid"), so the table's own *last* row is not guaranteed
 * to have a cell at `selectedColumnIndex` at all. Walks backward from the
 * last body row to find the last one that actually has a cell in this
 * column, rather than assuming the last row unconditionally does.
 *
 * **Alignment with the existing grid, not a doubled border.** The
 * overlay's own box uses these cells' `getBoundingClientRect()` values
 * directly, with no manual pixel inset/outset — a `<td>`'s own
 * border-box already includes its own `border-right` (or, for the first/
 * last column and the header/last row, the table's own outer border on
 * `.cm-table-wrapper` — neither carries a border of its own, per
 * `tableWidget.css`'s own doc comment on that rule). Drawing this
 * element's own border at exactly that same rectangle, via
 * `box-sizing: border-box` (`tableSelectionOverlay.css`), places the new
 * outline directly on top of the existing grid line rather than beside
 * it — reading as "this line is now highlighted," not as a second,
 * adjacent line.
 */
export function positionColumnSelectionOverlay(
  overlay: HTMLElement,
  scrollContainer: HTMLElement,
  table: HTMLTableElement,
  selectedColumnIndex: number
): void {
  const headerCell = table.tHead?.rows[0]?.cells[selectedColumnIndex];
  if (!headerCell) {
    return;
  }

  const bodyRows = table.tBodies[0]?.rows;
  let lastColumnCell: HTMLTableCellElement | undefined;
  if (bodyRows) {
    for (let i = bodyRows.length - 1; i >= 0; i--) {
      const cell = bodyRows[i]?.cells[selectedColumnIndex];
      if (cell) {
        lastColumnCell = cell;
        break;
      }
    }
  }
  // No data row has a cell in this column at all (header-only table, or
  // every row is ragged short of this column) — the header alone still
  // bounds a valid, if single-row, rectangle.
  const bottomCell = lastColumnCell ?? headerCell;

  const containerRect = scrollContainer.getBoundingClientRect();
  const headerRect = headerCell.getBoundingClientRect();
  const bottomRect = bottomCell.getBoundingClientRect();

  overlay.style.left = `${headerRect.left - containerRect.left + scrollContainer.scrollLeft}px`;
  overlay.style.top = `${headerRect.top - containerRect.top + scrollContainer.scrollTop}px`;
  overlay.style.width = `${headerRect.width}px`;
  overlay.style.height = `${bottomRect.bottom - headerRect.top}px`;
  overlay.classList.add(VISIBLE_CLASS);
}

/**
 * Measures `table`'s own `selectedRowIndex` row and positions `overlay`
 * to outline it, then reveals it — the row-selection sibling of
 * `positionColumnSelectionOverlay` above; same overlay element, same
 * `.cm-table-scroll` coordinate space, same deferred-call/`isConnected`
 * contract (see that function's own doc comment for both — not repeated
 * here). Does nothing (leaves `overlay` invisible) if `selectedRowIndex`
 * doesn't resolve to a real rendered `<tr>` — defensive only, for the same
 * reason `positionColumnSelectionOverlay`'s own header-cell check is:
 * `tableSelection.ts`'s own remap logic already validates the row exists
 * before this can be reached.
 *
 * **`selectedRowIndex` → DOM row.** `getNavigableRows(table)`'s own
 * convention (`tableSelection.ts`, `TableWidget`'s own doc comments) is
 * header = index 0, first body row = index 1, and so on — never a second,
 * independent row-index system. `table.tBodies[0].rows` is exactly that
 * same body-row sequence in the same document order
 * (`TableWidget.toDOM()`'s own `bodyRows.forEach` builds `<tr>`s in that
 * order), offset by one for the header, hence `selectedRowIndex - 1`.
 *
 * **Ragged rows — simpler here than the column case.** A row selection
 * only ever needs *that one row's* own rendered cells, and `row.cells`
 * already contains only the cells actually rendered for it (GFM tolerates
 * a data row with fewer cells than the header — `TableWidget`'s own doc
 * comment: "rendered as-is, no padding to a rectangular grid") — no
 * cross-row search is needed the way the column function's own "walk
 * backward to find the last row that has this column" is, since every
 * cell under consideration already belongs to the one selected row.
 * `row.cells[0]`/`row.cells[row.cells.length - 1]` are simply that row's
 * own first and last actually-rendered cells, whatever their count.
 *
 * **Height from the first cell alone.** Every cell within the same `<tr>`
 * renders at that row's own shared height by definition (a table row's
 * height is however tall its tallest cell is, and every cell box
 * stretches to fill it) — `firstRect`'s own top/bottom already describe
 * the whole row's vertical extent; a second measurement from `lastCell`
 * would only re-derive the identical values.
 */
export function positionRowSelectionOverlay(
  overlay: HTMLElement,
  scrollContainer: HTMLElement,
  table: HTMLTableElement,
  selectedRowIndex: number
): void {
  const row = table.tBodies[0]?.rows[selectedRowIndex - 1];
  const firstCell = row?.cells[0];
  const lastCell = row?.cells[row.cells.length - 1];
  if (!row || !firstCell || !lastCell) {
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const firstRect = firstCell.getBoundingClientRect();
  const lastRect = lastCell.getBoundingClientRect();

  overlay.style.left = `${firstRect.left - containerRect.left + scrollContainer.scrollLeft}px`;
  overlay.style.top = `${firstRect.top - containerRect.top + scrollContainer.scrollTop}px`;
  overlay.style.width = `${lastRect.right - firstRect.left}px`;
  overlay.style.height = `${firstRect.height}px`;
  overlay.classList.add(VISIBLE_CLASS);
}

/**
 * Re-invalidates the overlay's own geometry whenever `table`'s own
 * rendered box changes size — a window resize, a container reflow, or a
 * row growing/shrinking (typed content wrapping to another line) all
 * change `table`'s own border-box, which is exactly what this observes.
 * `measure` is the caller's own closure re-running
 * `positionColumnSelectionOverlay` against the *current* selected column
 * — this function owns only the "when to re-measure" trigger, never the
 * measurement itself, so there is exactly one geometry code path
 * (`positionColumnSelectionOverlay`) for both the initial position and
 * every subsequent re-position; no second geometry mechanism.
 *
 * **Why `table`, not `scrollContainer` (`.cm-table-scroll`) or
 * `.cm-table-wrapper`.** `table`'s own border-box is the one thing that
 * directly determines every cell's own geometry: `table-layout: fixed`
 * (`tableWidget.css`'s own doc comment) makes column widths a pure
 * function of the table's own overall width, and row heights are the
 * table's own content-driven height. `scrollContainer`/`.cm-table-wrapper`
 * only change size *because* the table's own rendered size (or the
 * space available to it) changed — observing `table` itself is the
 * "smallest stable element whose size change invalidates the cell
 * geometry," not a larger ancestor that would fire for the same
 * underlying reason at one more remove.
 *
 * **No observer → measure → mutate → observer loop.** `measure` only
 * ever writes to `overlay`'s own `style`/`classList` — `overlay` is never
 * itself observed (only `table` is), so positioning it can never
 * re-trigger this same observer.
 *
 * **Lifecycle — created once per `TableWidget.toDOM()` call that has a
 * selected column, disconnected in that same widget instance's own
 * `destroy()`.** A plain DOM event listener stops mattering on its own
 * once its element is detached and garbage-collected, but a
 * `ResizeObserver` does not: `.observe()` holds its own internal
 * reference to `table`, which would otherwise keep reporting size
 * changes (and keep the old, discarded `table` reachable) indefinitely
 * across every future rebuild if nothing ever called `.disconnect()`.
 * `TableWidget` stores the returned observer as an instance field
 * specifically so its own `destroy(dom)` — CM6's documented hook for
 * "this widget's DOM is being discarded," called whenever `eq()` says a
 * table rebuild is a genuinely new widget, which is every actual
 * rebuild here — can disconnect it. Never recreated on every
 * measurement: exactly one `ResizeObserver` per `toDOM()` call, reused
 * for every callback fire until that same instance's `destroy()` tears
 * it down.
 *
 * Returns `null` (does nothing) when `ResizeObserver` itself isn't
 * available — defensive, not a real-world concern (every current
 * evergreen engine, WKWebView included, implements it), but this
 * codebase's own test environment (jsdom) does not provide one globally
 * by convention (`vitest.setup.ts`'s own doc comment: `ResizeObserver`
 * stubs are deliberately *local* to whichever test file needs per-test
 * control over the callback, not a global polyfill) — this guard is what
 * keeps every *other* test that renders a selected column from crashing
 * with a bare `ReferenceError`, without needing every such test to
 * provide its own irrelevant mock.
 */
export function attachTableSelectionOverlayResize(table: HTMLTableElement, measure: () => void): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') {
    return null;
  }
  const observer = new ResizeObserver(() => {
    measure();
  });
  observer.observe(table);
  return observer;
}
