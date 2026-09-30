/**
 * Lets a table wider than the normal Markdown reading column
 * (`--editor-width-max`, `design-system/tokens.css`) break out of it and
 * render symmetrically wider — extending equally left *and* right past the
 * column's own edges, up to the real available page width minus a fixed
 * inset on each side — while a table that already fits renders exactly as
 * it always has, left-aligned with ordinary paragraph text. Three genuinely
 * different widths stay independent throughout: the readable-text column,
 * this table's own available breakout width, and the actual `<table>`'s own
 * intrinsic width (still driven entirely by `tableWidget.ts`'s own
 * `columnWidths`/`<colgroup>`, untouched by anything here).
 *
 * **This module's own job is deliberately tiny: publish one number.**
 * Everything else — growing to fit the table, capping at the available
 * width, centering on the reading column's own center point, and reserving
 * room for the column/row handles' own border-straddling protrusion — is
 * plain CSS on `.cm-table-wrapper--explicit-widths .cm-table-scroll`/
 * `.cm-table-inner` (`tableWidget.css`), using the classic `left: 50%;
 * transform: translateX(-50%)` technique (centers regardless of the
 * element's own width, since shifting right by 50% of the *containing
 * block's* width and then left by 50% of the *element's own* width always
 * nets to the containing block's own center) plus `width: max-content` /
 * `min-width: 100%` / `max-width: calc(...)` to grow-and-cap. There is no
 * page-layout-agnostic way to know the real available width from CSS
 * alone, though — Clutter's own sidebar makes the true available width a
 * fraction of the raw viewport, not `100dvw` — so that one number has to
 * come from a live measurement, published as a custom property
 * (`--table-breakout-max-width`) that the CSS then references directly.
 *
 * Handles stay exactly where they've always been — inside their own owning
 * cell, positioned by plain cell-relative CSS
 * (`tableHandleOverlay.css`) — this module never touches them, measures
 * them, or knows they exist.
 *
 * Scoped to explicit-widths tables only (`TableWidget.columnWidths !==
 * null`) — a plain table's own `width: 100%` already fills whatever width
 * its container has, so there is nothing to break out of.
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

const BREAKOUT_MAX_WIDTH_PROPERTY = '--table-breakout-max-width';

/**
 * Publishes `ancestor.clientWidth` onto `wrapper` as
 * `--table-breakout-max-width`, kept current via `ResizeObserver` — the
 * same "observe the real ancestor, re-measure on change" idiom
 * `tableSelectionOverlay.ts`'s own `attachTableSelectionOverlayResize`
 * already uses, applied to a different ancestor for a different property.
 * `clientWidth`, not `getBoundingClientRect().width` — excludes `ancestor`'s
 * own scrollbar gutter (relevant here: `.page__content` is the app's
 * vertical scroll container). Published on `wrapper`, not `widget` — CSS
 * custom properties inherit downward regardless of which ancestor
 * publishes them, and `.cm-table-scroll`'s own CSS (`tableWidget.css`)
 * reads it directly via `var(...)`.
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
        wrapper.style.setProperty(BREAKOUT_MAX_WIDTH_PROPERTY, `${ancestor.clientWidth}px`);
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
