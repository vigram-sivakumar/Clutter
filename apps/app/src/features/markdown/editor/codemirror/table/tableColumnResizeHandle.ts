import type { EditorView } from '@codemirror/view';

import './tableColumnResizeHandle.css';
import {
  DEFAULT_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
  computeTableColumnWidthsCommitChange,
  materializeWidthsForResize,
  resolveTableColumnWidths,
} from './tableColumnWidthMetadata';
import { findAllTables } from './tableGeometry';

/**
 * Column-boundary resize — geometrically and interactionally distinct from
 * `tableHandleOverlay.ts`'s own column select/reorder handle: that handle
 * sits centered *per column*, at the table's top edge, inside
 * `.cm-table-wrapper`; a resize hit-strip sits *at each column's own right
 * edge* (`columnCount` of them — every internal boundary, plus the last
 * column's own outer/right edge), spans the table's *full height*, and
 * lives inside `.cm-table-scroll` — a different DOM parent, so it scrolls
 * together with the table's own horizontal overflow, which a boundary
 * marker conceptually is part of (unlike the select handle, which is
 * anchored to the wrapper's own border and must *not* scroll away). No hit
 * area is shared between the two mechanisms, and neither one's pointer
 * handlers ever run for the other's gesture.
 *
 * **One strip per column, not one per internal gap.** Strip `i` always
 * resizes column `i` — this was already true for every *internal* boundary
 * before the last column gained its own handle (the strip between columns
 * 0 and 1 already only ever touched column 0's own width, never column
 * 1's), so extending the same loop one further, to `i = columnCount - 1`
 * (the last column's own right edge, with nothing after it to shift), is a
 * pure extension of an already-general shape — no branch anywhere in this
 * module needed to know "this is the edge one" specifically.
 *
 * **Same transient-DOM-state discipline as `tableHandleOverlay.ts`'s own
 * drag-to-reorder** (see that file's own top doc comment, § "Why nothing
 * is `view.dispatch`ed until the drag actually commits"): the whole drag
 * lives as local closure state (`session`, below), zero CM6 involvement
 * until `pointerup` (or Escape) ends it, so a mid-drag dispatch can never
 * tear down the very DOM this gesture is manipulating.
 *
 * **Implicit vs. explicit width, and the "first resize materializes
 * everything" moment** — this module's own responsibility is entirely
 * mechanical (turn a pointer delta into a `<col>`'s inline width, then a
 * persisted array on commit); the *rule* for what that array should
 * contain is `tableColumnWidthMetadata.ts`'s own `materializeWidthsForResize`,
 * reused verbatim, never reimplemented here. The one piece of *visual*
 * bookkeeping this module does own: the moment a drag becomes a *real*
 * drag (the first `pointermove`, never merely `pointerdown` — see below)
 * on a table with no persisted metadata, every column's `<col>` is given
 * an explicit inline width (each column's own *current effective* width —
 * measured from its rendered header cell when no metadata exists, never a
 * blind `DEFAULT_TABLE_COLUMN_WIDTH` guess, per `effectiveWidths()`'s own
 * doc comment) and the table switches to intrinsic-width/scrollable mode
 * (`.cm-table-wrapper--explicit-widths`), so growing the dragged column
 * during the drag can never squeeze its siblings the way
 * `table-layout: fixed` would otherwise do with only one column pinned and
 * the rest still auto. This is a purely local DOM change at this point,
 * reverted on cancel, made real only if the drag actually commits.
 *
 * **A `pointerdown` alone — released with no movement at all — must leave
 * the table completely untouched: no DOM width change, no dispatch, no
 * metadata, no history entry.** This is why the materialization above is
 * deferred to the first real `pointermove`, not performed eagerly on
 * `pointerdown` the way an earlier version of this module did: doing it
 * on `pointerdown` meant a plain click — no drag at all — visibly snapped
 * every column to its "effective" width the instant the pointer went down,
 * a real, reported bug (every column reading as 200px on a table whose
 * actual rendered widths were never 200). `handlePointerUp` mirrors the
 * same rule for the commit itself: it only calls `commitResize` when
 * either a real `pointermove` already fired (`dragMaterialized`) or the
 * pointer *released* at a different `clientX` than it started at (the one
 * legitimate "no intervening pointermove event, but still a real drag"
 * case — a direct down-then-up jump) — never merely because a session
 * object exists.
 */

const RESIZING_CURSOR_CLASS = 'cm-table-column-resizing-active';
const EXPLICIT_WIDTHS_CLASS = 'cm-table-wrapper--explicit-widths';

interface ResizeSession {
  /** The column whose own right boundary is being dragged — the one column this resize affects (`materializeWidthsForResize`'s own `resizedIndex`). */
  readonly columnIndex: number;
  readonly columnCount: number;
  readonly startClientX: number;
  readonly startWidth: number;
  /** Every column's own effective width at drag start (persisted, or `DEFAULT_TABLE_COLUMN_WIDTH` for every column when no metadata existed yet) — captured once, reused for both the live sibling-pinning above and to restore on cancel. */
  readonly startWidths: readonly number[];
  /** Whether `.cm-table-wrapper--explicit-widths` was already present *before* this drag started — a cancelled first-resize must remove it again (and every inline `<col>` width) to fully restore the table's own prior auto-layout appearance; a cancelled resize of an *already*-explicit table must not. */
  readonly wasAlreadyExplicit: boolean;
}

/**
 * The width to apply for `clientX`, given `session`'s own start position —
 * shared by the live drag (`handlePointerMove`) and the final commit
 * (`handlePointerUp`), so both ever compute the width the same way and the
 * committed value never differs from what was last shown on screen. Rounds
 * to a whole pixel *before* clamping — real pointer coordinates are
 * frequently fractional (subpixel/high-DPI reporting), and without
 * rounding, `MIN_TABLE_COLUMN_WIDTH`'s own clamp only ever fires for a raw
 * value at or below exactly `60`, so a drag that lands at, say, `60.4`
 * (extremely common with real hardware) neither reads as "at the minimum"
 * nor produces a clean value — this is the exact, reproduced cause of a
 * real bug ("70.96875px" persisted verbatim, and a column that visually
 * couldn't be dragged down to a clean `60`). Rounding first means any raw
 * value in `(59.5, 60.5)` already becomes exactly `60` on its own, and
 * anything at or below `59.5` still gets `Math.max`'d up to `60` regardless
 * — either path reaches the same clean integer.
 */
function clampedWidthFromPointer(session: ResizeSession, clientX: number): number {
  const delta = clientX - session.startClientX;
  return Math.max(MIN_TABLE_COLUMN_WIDTH, Math.round(session.startWidth + delta));
}

/**
 * Attaches `columnCount` resize hit-strips to `wrapper`'s own
 * `.cm-table-scroll` — one per column, at that column's own right edge:
 * every internal boundary (columns `0..columnCount - 2`) plus the last
 * column's own outer/right edge (column `columnCount - 1`), so the last
 * column is resizable the same way every other one already is. A table
 * with no columns has nothing to resize, so this is a no-op then (a real
 * GFM table always has at least one column — this guard is defensive
 * only). `columnWidths` is this table's own already-resolved persisted
 * widths (`TableWidget.columnWidths` — `null` when none exist), threaded
 * straight through rather than re-resolved here, matching every other
 * per-render value this widget already hands down rather than re-deriving.
 *
 * `restoreScrollLeftAfterPositioning`, when given, is applied to
 * `tableScroll` immediately after this call's own deferred
 * `positionBoundaries()` run below — `tableWidget.ts`'s own
 * `pendingScrollRestoreByTableFrom` doc comment has the full reasoning for
 * why cell activation's own scroll-position fix belongs here rather than
 * at its own, earlier call site: a cell click's own widget rebuild
 * replaces `.cm-table-scroll` with a fresh element (`scrollLeft` reset to
 * 0), and restoring that position any earlier than this — before the last
 * column's own resize-hit strip has actually been positioned — gets
 * silently clamped short by the browser's own native `scrollLeft` setter,
 * confirmed live. `undefined` (every caller except `TableWidget.toDOM()`'s
 * own cell-activation path) restores nothing, matching this parameter's
 * own absence before it existed.
 */
export function attachTableColumnResizeHandles(
  wrapper: HTMLElement,
  tableFrom: number,
  view: EditorView,
  columnCount: number,
  columnWidths: readonly number[] | null,
  restoreScrollLeftAfterPositioning?: number
): void {
  if (columnCount < 1) {
    return;
  }

  const tableScroll = wrapper.querySelector<HTMLElement>(':scope > .cm-table-scroll');
  if (!tableScroll) {
    return;
  }

  function resolveTableElement(): HTMLTableElement | null {
    return tableScroll!.querySelector<HTMLTableElement>(':scope > table');
  }

  function resolveCols(): HTMLTableColElement[] {
    const tableEl = resolveTableElement();
    return tableEl ? Array.from(tableEl.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')) : [];
  }

  /**
   * This table's own effective per-column widths right now — persisted
   * when valid; otherwise **measured from each column's own currently
   * rendered header cell**, not a blind `DEFAULT_TABLE_COLUMN_WIDTH` guess
   * for every column. A no-metadata table renders under ordinary
   * `table-layout: fixed` auto-division, which only equals
   * `DEFAULT_TABLE_COLUMN_WIDTH` per column by coincidence (e.g. a
   * 3-column table exactly 600px wide) — for any other total width, the
   * real per-column split differs, and materializing a resize from the
   * wrong baseline would visibly (and silently) resize every *untouched*
   * column too, not just the one the user actually dragged. Falls back to
   * `DEFAULT_TABLE_COLUMN_WIDTH` only when a cell can't be measured at all
   * (not yet laid out — e.g. `getBoundingClientRect()` reporting `0`, the
   * default in a detached/test DOM with no real layout engine) — this is
   * also why every existing test in this file that doesn't explicitly mock
   * header-cell geometry still sees the same `200`-per-column baseline it
   * always has.
   */
  function effectiveWidths(): number[] {
    if (columnWidths) {
      return columnWidths.slice();
    }
    const headerRow = resolveTableElement()?.rows[0];
    const widths: number[] = [];
    for (let i = 0; i < columnCount; i++) {
      const cell = headerRow?.children[i] as HTMLElement | undefined;
      const measured = cell ? Math.round(cell.getBoundingClientRect().width) : 0;
      widths.push(measured > 0 ? measured : DEFAULT_TABLE_COLUMN_WIDTH);
    }
    return widths;
  }

  const boundaries: HTMLElement[] = [];
  for (let i = 0; i < columnCount; i++) {
    const hit = document.createElement('div');
    hit.className = 'cm-table-column-resize-hit';
    tableScroll.appendChild(hit);
    boundaries.push(hit);
  }

  /** Positions each boundary strip at the right edge of the column it belongs to — measured from the *rendered* header cells (correct whether widths are explicit pixels or the default even division), relative to `tableScroll` itself so the strips scroll together with the table's own horizontal overflow. `boundaries[columnCount - 1]` (the last column's own strip) lands at that column's own right edge exactly the same way — `headerRow.children[columnCount - 1]` is that column's own header cell, nothing further needed. Re-run once at attach (deferred — see the call site below) and again after every resize commit (a fresh `attachTableColumnResizeHandles` call, since a commit rebuilds this whole widget); never during a drag itself, which only ever touches the one dragged `<col>`. No scroll listener is needed to keep a strip attached to its column while the user scrolls: once positioned in `tableScroll`'s own *content* coordinate space (the fix below), a strip is an ordinary DOM child of that scrolling container, exactly like `<table>` itself — native scrolling already pans it together with the table with no JS involved, the same reason `tableSelectionOverlay.ts`'s own overlay never re-measures on a scroll event either.
   *
   * **`+ tableScroll.scrollLeft` is load-bearing, not defensive.** `cellRect`/
   * `scrollRect` are both `getBoundingClientRect()` readings — *viewport*-
   * relative, i.e. "where this pixel currently is on screen" — but `left`
   * on a strip that is itself a plain DOM child of `tableScroll` (an
   * `overflow-x: auto` container, `tableWidget.css`'s own
   * `--explicit-widths .cm-table-scroll` rule)
   * is interpreted in that container's own *content* coordinate space, the
   * same unscrolled space the `<table>` itself and every one of its cells
   * already live in. At `scrollLeft === 0` those two spaces coincide, so a
   * boundary positioned that way looks correct at attach time regardless —
   * the actual drift only appears once the table has been scrolled and
   * this function runs again (a resize commit's own rebuild, or the
   * scroll listener below) while `scrollLeft !== 0`: every strip would
   * then land `scrollLeft` pixels off from its real column boundary,
   * reading as "not centered on the column" exactly as reported. Adding
   * back the current scroll offset converts the viewport-relative reading
   * into the same content-relative space `left` is actually interpreted
   * in — the identical conversion `tableSelectionOverlay.ts`'s own
   * `positionColumnSelectionOverlay` already performs for the same
   * reason (see that function's own "Coordinate space" doc comment). */
  function positionBoundaries(): void {
    const tableEl = resolveTableElement();
    const headerRow = tableEl?.rows[0];
    if (!headerRow) {
      return;
    }
    const scrollRect = tableScroll!.getBoundingClientRect();
    const scrollLeft = tableScroll!.scrollLeft;
    for (let i = 0; i < boundaries.length; i++) {
      const cell = headerRow.children[i] as HTMLElement | undefined;
      if (!cell) {
        continue;
      }
      const cellRect = cell.getBoundingClientRect();
      boundaries[i]!.style.left = `${cellRect.right - scrollRect.left + scrollLeft}px`;
    }
  }

  let session: ResizeSession | null = null;
  /** Whether `materializeDrag` has already run for the current `session` — i.e. whether a real `pointermove` has actually fired since `pointerdown`. `false` for the entire lifetime of a plain click (`pointerdown` immediately followed by `pointerup`, no movement), which is exactly the signal `handlePointerUp`/`handlePointerCancel`/`handleKeyDown` need to know there is nothing to commit or revert. */
  let dragMaterialized = false;

  /**
   * Writes every column's own current effective width onto its `<col>`
   * (`session.startWidths`, `effectiveWidths()`'s own real-measured
   * values) and switches the wrapper into `.cm-table-wrapper--explicit-widths`
   * mode — see this file's own top doc comment for why this must happen on
   * the first real `pointermove`, never on `pointerdown` itself. Idempotent
   * per drag: only the first call in a given session does anything.
   */
  function materializeDrag(activeSession: ResizeSession): void {
    if (dragMaterialized) {
      return;
    }
    dragMaterialized = true;
    const cols = resolveCols();
    cols.forEach((col, i) => {
      col.style.width = `${activeSession.startWidths[i]}px`;
    });
    wrapper.classList.add(EXPLICIT_WIDTHS_CLASS);
  }

  function stopTracking(): void {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerCancel);
    document.removeEventListener('keydown', handleKeyDown);
    document.body.classList.remove(RESIZING_CURSOR_CLASS);
  }

  /** Reverts every DOM-only change this drag made, with no `view.dispatch` — "cancel restores the original width state without creating history." */
  function revertDom(activeSession: ResizeSession): void {
    const cols = resolveCols();
    if (activeSession.wasAlreadyExplicit) {
      cols.forEach((col, i) => {
        col.style.width = `${activeSession.startWidths[i]}px`;
      });
    } else {
      cols.forEach((col) => {
        col.style.width = '';
      });
      wrapper.classList.remove(EXPLICIT_WIDTHS_CLASS);
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !session) {
      return;
    }
    event.preventDefault();
    if (dragMaterialized) {
      revertDom(session);
    }
    stopTracking();
    session = null;
    dragMaterialized = false;
  }

  /**
   * Keeps `tableScroll`'s own scroll position valid as the live drag
   * shrinks the intrinsic table underneath it — DOM-only, run after every
   * `<col>` width write in `handlePointerMove`, never on its own timer or
   * event. Dragging a column narrower shrinks the table's own rendered
   * width out from under whatever `scrollLeft` the user had already
   * scrolled to; left alone, the browser does **not** re-clamp an
   * existing `scrollLeft` value on its own just because the scrollable
   * content shrank — it silently allows a now-out-of-range `scrollLeft`
   * to persist, which reads as "the viewport stays scrolled too far
   * right" until *something* re-clamps it (previously: only the full-
   * widget rebuild after commit, on pointer-up — this function is what
   * makes that happen live, mid-drag, instead).
   *
   * **`table.getBoundingClientRect().width`, not `tableScroll.scrollWidth`
   * — load-bearing, confirmed live, not a style preference.** The natural
   * expression of `maxScrollLeft` is `tableScroll.scrollWidth -
   * tableScroll.clientWidth`, and that's what this function originally
   * used. Live-measured in the real app mid-drag: after shrinking a
   * column, `table.offsetWidth` (and `getBoundingClientRect().width`)
   * updated correctly and immediately on every single `pointermove`, but
   * `tableScroll.scrollWidth` — read in the same tick, even *after*
   * deliberately forcing a reflow by reading `table.offsetWidth` first —
   * stayed frozen at its pre-drag value across the entire drag, only
   * catching up once the widget rebuilt on `pointerup`. This is exactly
   * the "scroll position doesn't move until release, then snaps" bug
   * reported: `reconcileScrollPosition` itself ran every time and its
   * `min(current, max)` math was always correct, but `max` was computed
   * from a `scrollWidth` reading that had gone stale — a genuine
   * browser-level lag specific to an `overflow: auto` container's own
   * *scrollable overflow* recomputation, which apparently sits on a
   * different (lazier) invalidation path than the regular box-layout
   * properties (`offsetWidth`/`getBoundingClientRect()`) a plain forced
   * reflow already keeps current. `table` is `tableScroll`'s only child
   * (`tableWidget.ts`'s own DOM construction), so `table`'s own outer
   * width *is* `tableScroll`'s intrinsic content width — reading it
   * directly sidesteps the lagging property entirely rather than trying
   * to coax it into updating sooner.
   *
   * `min(current, max)`, never an unconditional reset — this only ever
   * *reduces* `scrollLeft`, and only when the current value has actually
   * gone stale (`current > max`), matching this milestone's own explicit
   * "preserve scroll position whenever it's still valid" requirement.
   * Setting `scrollLeft` to a value the browser itself would already
   * clamp (e.g. a negative `maxScrollLeft` when the table is narrower
   * than the viewport) is safe and a no-op beyond the browser's own
   * clamp-to-`[0, max]` behavior — no extra `Math.max(0, ...)` needed
   * here for that case, though `maxScrollLeft` itself is still computed
   * from real layout, not assumed non-negative.
   *
   * No `padding-left` term here — `tableWidget.css`'s
   * `.cm-table-wrapper--explicit-widths .cm-table-scroll` rule gives this
   * element no padding/margin of its own (just `overflow-x: auto`), so
   * `<table>`'s own width is the complete story for `maxScrollLeft`.
   */
  function reconcileScrollPosition(): void {
    const tableEl = resolveTableElement();
    if (!tableEl) {
      return;
    }
    const maxScrollLeft = tableEl.getBoundingClientRect().width - tableScroll!.clientWidth;
    if (tableScroll!.scrollLeft > maxScrollLeft) {
      tableScroll!.scrollLeft = maxScrollLeft;
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!session) {
      return;
    }
    // A real `pointermove` firing at all is this drag's own "movement
    // actually happened" signal (see this file's own top doc comment) —
    // materializes every column's current effective width the first time
    // this runs for the current session, a no-op on every call after.
    materializeDrag(session);
    const newWidth = clampedWidthFromPointer(session, event.clientX);
    const col = resolveCols()[session.columnIndex];
    if (col) {
      col.style.width = `${newWidth}px`;
    }
    reconcileScrollPosition();
  }

  /**
   * Commits the resize — re-resolves `table` fresh against current state
   * (never trusting anything captured at drag start, the same "never trust
   * a range/DOM node captured before an edit" discipline every other
   * commit path in this feature follows), then reuses
   * `materializeWidthsForResize` (unchanged from the structural-ops
   * milestone) and `computeTableColumnWidthsCommitChange` (which itself
   * locates the correct write range — see that function's own doc comment
   * for why it, not this caller, owns that decision) for the one
   * `ChangeSpec`, dispatched as the single transaction that both updates
   * the width and enters undo history as one step. `false` when the table
   * can no longer be found (defensive only — nothing in this codebase
   * currently removes a table out from under an in-progress drag).
   *
   * **`existing` falls back to `activeSession.startWidths`, never straight
   * to `materializeWidthsForResize`'s own internal
   * `DEFAULT_TABLE_COLUMN_WIDTH` default, when the table has no persisted
   * attribute yet.** `attribute?.widths` still wins whenever real metadata
   * exists (unchanged) — this fallback only matters for a table's *first*
   * resize, and `startWidths` (`effectiveWidths()`, captured at
   * `pointerdown`) already holds each untouched column's own real measured
   * width, never a blind guess — see `effectiveWidths()`'s own doc comment
   * for why. Passing it here means every untouched column commits at the
   * width it already visibly had, not at `200px` just because this is the
   * table's first explicit resize.
   */
  function commitResize(finalWidth: number, activeSession: ResizeSession): boolean {
    const table = findAllTables(view.state).find((t) => t.from === tableFrom);
    if (!table) {
      return false;
    }
    const attribute = resolveTableColumnWidths(view.state, table);
    const existing = attribute?.widths ?? activeSession.startWidths;
    const nextWidths = materializeWidthsForResize(existing, activeSession.columnCount, activeSession.columnIndex, finalWidth);
    const change = computeTableColumnWidthsCommitChange(view.state, table, nextWidths);
    view.dispatch({ changes: [change] });
    view.focus();
    return true;
  }

  /**
   * Restores `finalScrollLeft` — the live, drag-tracked scroll position
   * captured immediately *before* `commitResize`'s own `view.dispatch()`
   * — onto the table's freshly rebuilt `.cm-table-scroll`, clamped to
   * that fresh DOM's own valid range. UI state, not document state: never
   * dispatched, never part of the width-commit transaction itself, so it
   * has no bearing on undo/redo (undoing the resize restores the old
   * *widths*; scroll position is exactly as separate from that as which
   * pixel of the page happens to be under the cursor).
   *
   * **Called synchronously, right after `commitResize` returns — no
   * `queueMicrotask`, deliberately.** `TableWidget.toDOM()`'s own
   * `wasFocused` restoration (this file's sibling milestone) defers with
   * `queueMicrotask()` because *that* code runs *inside* `toDOM()` itself,
   * before CM6 has attached the widget's returned (still-detached) DOM
   * into the live document — reading geometry there would be meaningless.
   * This function runs from the opposite side of that same boundary:
   * `view.dispatch()` is synchronous, and CM6's own documented contract
   * (already relied on by `toDOM()`'s own doc comments elsewhere in this
   * file) is that a rebuilt widget's DOM is inserted into the live
   * document synchronously, within that same `dispatch()` call, before it
   * returns to this caller — confirmed live for this exact case: the
   * table's own `data-table-from` lookup below finds the real, attached,
   * freshly-rebuilt `.cm-table-scroll` immediately after `commitResize`
   * returns, with correct (forced-layout) geometry on the very first
   * read, no waiting required.
   *
   * **Re-queries fresh from the document by `tableFrom` — never reuses
   * this closure's own `wrapper`/`tableScroll`.** Those reference the
   * *old* widget's DOM, which `eq()` (comparing the old and new
   * `columnWidths`, now different) discards in favor of a brand-new
   * subtree the instant this table's rebuild runs — the same "never trust
   * a DOM node captured before a rebuild" discipline `commitResize`'s own
   * doc comment already states for *document positions*, applied here to
   * *DOM nodes*. `tableFrom` itself stays stable across this commit (the
   * change only ever rewrites the trailing `{table-col-widths=...}` line
   * *after* the table's own end, never anything at or before `table.from`
   * — `computeTableColumnWidthsCommitChange`'s own doc comment), so it
   * remains a valid, stable key to find the table's new DOM by, the same
   * lookup `tableBoundaryNavigation.ts` already uses for the identical
   * reason (this file's own `attachTableColumnResizeHandles` doc comment
   * references that convention).
   *
   * **Table width, not `scrollWidth`** — the same fix
   * `reconcileScrollPosition` above already required, applied here for
   * consistency rather than reintroducing the identical class of bug in a
   * second spot: `freshScroll.scrollWidth` is not to be trusted as
   * immediately live after a DOM change (confirmed live, this function's
   * sibling doc comment above), so `maxScrollLeft` is derived from the
   * fresh `<table>` element's own real rendered width instead.
   *
   * **`Math.max(0, ...)` here, unlike `reconcileScrollPosition`.** That
   * function relies on the browser's own native `scrollLeft` setter to
   * floor a negative assignment at 0 (its own doc comment). This function
   * computes `maxScrollLeft` the same way but is not itself assigning
   * that raw value to `scrollLeft` — `Math.min(finalScrollLeft,
   * maxScrollLeft)` — so a negative `maxScrollLeft` needs its own explicit
   * floor first, or `Math.min` would pick the negative number over a
   * positive `finalScrollLeft`, which the browser's setter would still
   * floor at 0 in the end but only after silently accepting a
   * conceptually wrong intermediate value; stating the floor explicitly
   * keeps the intent visible rather than depending on that fallback.
   */
  function restoreScrollPositionAfterCommit(finalScrollLeft: number): void {
    const freshWidget = document.querySelector<HTMLElement>(`.cm-table-widget[data-table-from="${tableFrom}"]`);
    const freshScroll = freshWidget?.querySelector<HTMLElement>(':scope > .cm-table-wrapper > .cm-table-scroll');
    const freshTable = freshScroll?.querySelector<HTMLTableElement>(':scope > table');
    if (!freshScroll || !freshTable) {
      return;
    }
    // No `padding-left` term — see `reconcileScrollPosition`'s own doc
    // comment above for why `<table>`'s own width is the complete story.
    const maxScrollLeft = Math.max(0, freshTable.getBoundingClientRect().width - freshScroll.clientWidth);
    freshScroll.scrollLeft = Math.min(finalScrollLeft, maxScrollLeft);
  }

  function handlePointerUp(event: PointerEvent): void {
    const activeSession = session;
    const wasDragged = dragMaterialized;
    session = null;
    dragMaterialized = false;
    stopTracking();
    if (!activeSession) {
      return;
    }
    // A real drag happened either if a `pointermove` already materialized
    // it, or — the one case with no intervening `pointermove` event at
    // all — the pointer still released at a different `clientX` than it
    // started at (a direct down-then-up jump). Anything else is a plain
    // click: no movement occurred, so nothing was ever touched and there
    // is nothing to commit — see this file's own top doc comment.
    const wasRealDrag = wasDragged || event.clientX !== activeSession.startClientX;
    if (!wasRealDrag) {
      return;
    }
    const finalWidth = clampedWidthFromPointer(activeSession, event.clientX);
    // Captured before `commitResize`'s own dispatch — the live, drag-
    // tracked position `reconcileScrollPosition` has kept valid throughout
    // (this function's own doc comment), which the rebuild below would
    // otherwise discard by starting the new `.cm-table-scroll` at its
    // default `scrollLeft` of 0.
    const finalScrollLeft = tableScroll!.scrollLeft;
    if (commitResize(finalWidth, activeSession)) {
      restoreScrollPositionAfterCommit(finalScrollLeft);
    } else if (wasDragged) {
      revertDom(activeSession);
    }
  }

  function handlePointerCancel(): void {
    const activeSession = session;
    const wasDragged = dragMaterialized;
    session = null;
    dragMaterialized = false;
    stopTracking();
    if (activeSession && wasDragged) {
      revertDom(activeSession);
    }
  }

  function handlePointerDown(columnIndex: number, event: PointerEvent): void {
    if (event.button > 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const widths = effectiveWidths();
    const wasAlreadyExplicit = wrapper.classList.contains(EXPLICIT_WIDTHS_CLASS);
    session = {
      columnIndex,
      columnCount,
      startClientX: event.clientX,
      startWidth: widths[columnIndex]!,
      startWidths: widths,
      wasAlreadyExplicit,
    };
    dragMaterialized = false;
    // Deliberately no DOM write and no `.cm-table-wrapper--explicit-widths`
    // here — see this file's own top doc comment for why that
    // materialization is deferred to the first real `pointermove`
    // (`materializeDrag`), not performed on `pointerdown` itself: a plain
    // click (down, then up, no movement) must leave the table completely
    // untouched.
    document.body.classList.add(RESIZING_CURSOR_CLASS);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('keydown', handleKeyDown);
  }

  boundaries.forEach((hit, i) => {
    // Suppresses root CM6's own mousedown handling the same way every
    // other non-cell hit-target in this widget already does
    // (`tableHandleOverlay.ts`'s own `preventActivation`) — a resize drag
    // must never place the root caret or activate a cell.
    hit.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    hit.addEventListener('pointerdown', (event) => handlePointerDown(i, event as PointerEvent));
  });

  // Deferred — `wrapper`/`tableScroll` are not yet attached to the live
  // document at the point `TableWidget.toDOM()` calls this function (the
  // same "not yet attached" constraint `tableHandleOverlay.ts`'s own
  // initial-state comment documents for the identical reason:
  // `getBoundingClientRect()` on a still-detached subtree returns a
  // meaningless zero rect). `isConnected` re-checked at fire time in case a
  // second, unrelated rebuild lands first and discards this exact instance.
  //
  // `restoreScrollLeftAfterPositioning` is applied here, immediately after
  // `positionBoundaries()` returns — not before, and not in any separate
  // microtask of its own (see this function's own doc comment for why
  // restoring any earlier gets silently clamped short by the browser's own
  // native `scrollLeft` setter). No clamp math of its own: by this point
  // `tableScroll`'s true scrollable extent already includes the last
  // column's own resize-hit overhang that `positionBoundaries()` just
  // applied, so a plain assignment clamps correctly on its own, the same
  // as any ordinary `scrollLeft` write against settled layout.
  queueMicrotask(() => {
    if (wrapper.isConnected) {
      positionBoundaries();
      if (restoreScrollLeftAfterPositioning !== undefined) {
        tableScroll.scrollLeft = restoreScrollLeftAfterPositioning;
      }
    }
  });
}
