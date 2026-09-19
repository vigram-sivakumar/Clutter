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
