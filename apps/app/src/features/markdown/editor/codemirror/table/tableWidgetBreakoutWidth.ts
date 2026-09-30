import { centerScrollIfTableOverflowsWidget } from './tableColumnResizeHandle';

/**
 * Lets a table wider than the normal Markdown reading column
 * (`--editor-width-max`, `design-system/tokens.css`) break out of it and
 * render symmetrically wider — extending equally left *and* right past the
 * column's own edges, up to the real available page width minus a 24px
 * inset on each side — while a table that already fits stays exactly where
 * it always was, left-aligned with ordinary paragraph text. Three
 * genuinely different widths stay independent throughout: the readable-text
 * column, this table's own available breakout width, and the actual
 * `<table>`'s own intrinsic width (still driven entirely by
 * `tableWidget.ts`'s own `columnWidths`/`<colgroup>`, untouched by anything
 * here).
 *
 * **The decision, in the exact terms this module measures them:**
 *
 * ```
 * naturalWidth = .cm-table-widget's own rendered width (never touched by
 *                this module — always exactly the reading column's width)
 * tableWidth   = the actual <table>'s own rendered width
 *
 * if tableWidth <= naturalWidth:
 *   the wrapper renders at its own default 100% (of naturalWidth) — left-
 *   aligned with the surrounding text, exactly as if this module didn't
 *   exist.
 * else:
 *   breakoutMax  = the real horizontal-clip ancestor's own content width,
 *                  minus 24px on each side
 *   availableWidth = min(tableWidth, breakoutMax)
 *   shift = (availableWidth - naturalWidth) / 2
 *   the wrapper renders `availableWidth` wide, shifted left by `shift` —
 *   centered on the *same center point* the narrow reading column already
 *   occupied, extending equally past both of its edges.
 * ```
 *
 * **Why a `margin-left` shift on `.cm-table-wrapper`, not any change to
 * `.cm-table-widget` itself.** `.cm-table-widget` is the one element CM6
 * actually manages the block-position of; this module never gives it a
 * `width`, `margin`, or `transform` of any kind, so CM6's own line-position
 * bookkeeping sees exactly the same stable box it always has. Every
 * ancestor between `.cm-table-widget` and the page shell's own real
 * horizontal boundary is already `overflow: visible` (`tableWidget.css`'s
 * own four-layer doc comment; `.cm-scroller`, `.cm-content`/`.cm-line` per
 * `MarkdownEditor.css`; the reading column itself, `.page-content`/
 * `.markdown__editor`, sets no `overflow` of its own either) — a child can
 * already legitimately render wider than its parent and outside its edges
 * *in either direction*, all the way out to the one real clip,
 * `.page__content`'s own deliberate `overflow-x: hidden` (`Page.css`). So
 * centering the *visible table* on the reading column's own center is just
 * a `width` + `margin-left` pair on `.cm-table-wrapper` (this widget's own
 * private child DOM, explicitly *not* a `.cm-line`/`blockWrappers` wrapper
 * per this file's own top-of-file doc comment — margin here doesn't touch
 * anything the permanent CM6 `margin` rule in `CLAUDE.md` is actually
 * about) — never a repositioning of `.cm-table-widget` itself.
 *
 * Scoped to explicit-widths tables only (`TableWidget.columnWidths !==
 * null`) — a plain table's own `width: 100%` already makes `tableWidth`
 * trivially equal to whatever width its container happens to have, so the
 * `tableWidth <= naturalWidth` branch is the only one that could ever fire
 * for it regardless; there is nothing to break out of.
 */

/**
 * Walks up from `el` to the nearest ancestor whose computed `overflow-x` is
 * not `visible` — the page shell's own real horizontal-clipping boundary
 * (`.page__content`, `Page.css`, deliberately `overflow-x: hidden` so
 * nothing ever escapes it), found generically by computed style rather than
 * a hardcoded class name, mirroring `MarkdownEditor.tsx`'s own
 * `findScrollableAncestor` (same technique, the X axis instead of Y) — so
 * this module stays uncoupled from the page shell's own DOM structure the
 * same way that helper already is. `null` if none is found (detached DOM,
 * or a host page shell with no such boundary at all).
 */
export function findHorizontalClipAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    if (getComputedStyle(node).overflowX !== 'visible') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

const BREAKOUT_WIDTH_PROPERTY = '--table-breakout-width';
const BREAKOUT_SHIFT_PROPERTY = '--table-breakout-shift';

/** The requested breathing room from the true page boundary on *each* side once a table has broken out. */
const EDGE_INSET_PX = 24;

/**
 * Computes and applies this render's own `width`/`margin-left` pair onto
 * `wrapper`, per this file's own top doc comment. `widget.getBoundingClientRect().width`
 * for `naturalWidth` is safe to re-read on every call (including repeated
 * `ResizeObserver` ticks after a previous call already widened `wrapper`)
 * precisely because `widget` itself is never touched — its own width is a
 * pure function of its containing block, never of anything this module
 * does to its child.
 *
 * `ancestor.clientWidth`, not `getBoundingClientRect().width` — excludes
 * `ancestor`'s own scrollbar gutter (relevant here: `.page__content` is the
 * app's vertical scroll container).
 */
function applyBreakout(widget: HTMLElement, wrapper: HTMLElement, ancestor: HTMLElement): void {
  const table = wrapper.querySelector<HTMLElement>(':scope > .cm-table-scroll > table');
  if (!table) {
    return;
  }
  const naturalWidth = widget.getBoundingClientRect().width;
  const tableWidth = table.getBoundingClientRect().width;
  if (tableWidth <= naturalWidth) {
    wrapper.style.removeProperty(BREAKOUT_WIDTH_PROPERTY);
    wrapper.style.removeProperty(BREAKOUT_SHIFT_PROPERTY);
    return;
  }
  const breakoutMax = ancestor.clientWidth - EDGE_INSET_PX * 2;
  const availableWidth = Math.min(tableWidth, breakoutMax);
  const shift = (availableWidth - naturalWidth) / 2;
  wrapper.style.setProperty(BREAKOUT_WIDTH_PROPERTY, `${availableWidth}px`);
  wrapper.style.setProperty(BREAKOUT_SHIFT_PROPERTY, `${-shift}px`);
}

/**
 * Re-applies `centerScrollIfTableOverflowsWidget`'s own centering decision
 * (`tableColumnResizeHandle.ts`) after a width change this module just
 * made — necessary because a window resize can flip a table from fitting
 * to overflowing *even its own widened viewport*, or back, with no
 * `TableWidget` rebuild involved at all (this whole module only ever
 * changes CSS custom properties; nothing here ever dispatches).
 *
 * Guarded on `tableScroll.scrollLeft === 0` — a table the user has actually
 * scrolled away from is never yanked back to center by an unrelated window
 * resize; only one still sitting at the untouched native default gets
 * recentered.
 */
function recenterIfAtRest(wrapper: HTMLElement): void {
  const scroll = wrapper.querySelector<HTMLElement>(':scope > .cm-table-scroll');
  const table = scroll?.querySelector<HTMLElement>(':scope > table');
  if (!scroll || !table || scroll.scrollLeft !== 0) {
    return;
  }
  centerScrollIfTableOverflowsWidget(scroll, table);
}

/**
 * Publishes `applyBreakout(widget, wrapper, ancestor)` on every relevant
 * change, kept current via `ResizeObserver` — the same "observe the real
 * ancestor, re-measure on change" idiom `tableSelectionOverlay.ts`'s own
 * `attachTableSelectionOverlayResize` already uses, applied to a different
 * ancestor for a different property. Observing `ancestor` alone
 * (`.page__content`) is enough to catch every relevant change, including
 * the reading column's own width changing on a window resize — that
 * column's width is a pure function of `ancestor`'s own (`calc(100% -
 * 80px)`, `design-system/tokens.css`), so the two always change together.
 *
 * Deferred one microtask before the first measurement/observe — mirrors
 * every other geometry read in this feature (`tableColumnResizeHandle.ts`'s
 * own `positionBoundaries()`, `tableWidget.ts`'s own `wasFocused` block):
 * `widget` is not yet attached to the live document at the point
 * `TableWidget.toDOM()` calls this, so `findHorizontalClipAncestor` would
 * find nothing yet. `widget.isConnected` re-checked at fire time for the
 * same reason those call sites already re-check it — a second, unrelated
 * rebuild landing first would have already discarded this exact instance.
 *
 * Returns a disposable handle so `TableWidget` can disconnect it in its own
 * `destroy()`, exactly like its existing selection-overlay observer —
 * never the `ResizeObserver` instance itself, since that instance is only
 * ever created *inside* the deferred microtask below, well after this
 * function has already returned to its caller.
 */
export interface BreakoutWidthHandle {
  disconnect(): void;
}

export function attachTableWidgetBreakoutWidth(widget: HTMLElement, wrapper: HTMLElement): BreakoutWidthHandle {
  let observer: ResizeObserver | null = null;
  let disconnected = false;
  if (typeof ResizeObserver !== 'undefined') {
    queueMicrotask(() => {
      if (disconnected || !widget.isConnected) {
        return;
      }
      const ancestor = findHorizontalClipAncestor(widget);
      if (!ancestor) {
        return;
      }
      const publish = (): void => {
        applyBreakout(widget, wrapper, ancestor);
        recenterIfAtRest(wrapper);
      };
      publish();
      observer = new ResizeObserver(publish);
      observer.observe(ancestor);
    });
  }
  return {
    disconnect(): void {
      disconnected = true;
      observer?.disconnect();
      observer = null;
    },
  };
}
