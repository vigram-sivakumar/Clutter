// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  getBulletMarkerFootprintPx,
  getFixedMarkerWidthPx,
  getOrderedMarkerFootprintPx,
  getTaskMarkerFootprintPx,
  getTaskSeparatorWidthPx,
  refreshListMarkerWidthCache,
} from './listMarkerWidth';

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create({ doc: '' }), parent });
}

/**
 * jsdom loads no real stylesheet, so a probe's computed margin normally
 * resolves to `0px` — fine for structural tests, but the trailing-margin
 * regression this file guards against (see `listMarkerWidth.ts`'s own
 * doc comment: bullets/ordered markers under-counted their real
 * footprint by exactly `+4px`, the task checkbox by `-1px`, because the
 * *margin* after each marker's own box was never counted) needs a real,
 * non-zero margin value to actually exercise the addition. This injects
 * a real `<style>` rule jsdom's CSSOM *does* resolve via
 * `getComputedStyle()`, scoped to one throwaway class per test so tests
 * don't interfere with each other.
 */
function withMarginRule(selector: string, declaration: string, run: () => void): void {
  const style = document.createElement('style');
  style.textContent = `${selector} { ${declaration} }`;
  document.head.appendChild(style);
  try {
    run();
  } finally {
    document.head.removeChild(style);
  }
}

describe('listMarkerWidth', () => {
  afterEach(() => {
    refreshListMarkerWidthCache();
    vi.restoreAllMocks();
  });

  describe('getFixedMarkerWidthPx (bullets, task checkboxes)', () => {
    it('falls back to 24px when --md-marker-width is unset (jsdom has no stylesheet)', () => {
      expect(getFixedMarkerWidthPx()).toBe(24);
    });

    it('caches the value across calls until an explicit refresh', () => {
      const spy = vi.spyOn(window, 'getComputedStyle');
      getFixedMarkerWidthPx();
      getFixedMarkerWidthPx();
      const callsBeforeRefresh = spy.mock.calls.length;

      refreshListMarkerWidthCache();
      getFixedMarkerWidthPx();

      expect(spy.mock.calls.length).toBeGreaterThan(callsBeforeRefresh);
    });
  });

  describe('getBulletMarkerFootprintPx', () => {
    it('is just the fixed box width when no trailing-margin rule is present (jsdom default)', () => {
      expect(getBulletMarkerFootprintPx(mountView())).toBe(getFixedMarkerWidthPx());
    });

    /**
     * Regression test for the exact bug found live: bullets carry a real
     * `margin-right` after their own box (`.cm-bullet-list-marker--glyph`),
     * which must be *added* to the box width, not ignored.
     */
    it('adds the real .cm-bullet-list-marker--glyph margin-right on top of the fixed box width', () => {
      withMarginRule('.cm-bullet-list-marker--glyph', 'margin-right: 4px;', () => {
        refreshListMarkerWidthCache();
        expect(getBulletMarkerFootprintPx(mountView())).toBe(getFixedMarkerWidthPx() + 4);
      });
    });

    /**
     * Regression test for the *second* bug found live, after the first
     * fix: the real CSS rules are all scoped `.cm-editor <selector>` (a
     * descendant combinator), so a probe appended to `document.body`
     * directly reads back `margin-right: 0px` — silently no-oping the
     * whole calculation without erroring. The probe must be mounted
     * inside the actual `view.dom` (which carries `cm-editor`) for a
     * `.cm-editor`-scoped rule to resolve at all.
     */
    it('resolves a .cm-editor-scoped margin rule because the probe mounts inside view.dom', () => {
      withMarginRule('.cm-editor .cm-bullet-list-marker--glyph', 'margin-right: 4px;', () => {
        refreshListMarkerWidthCache();
        expect(getBulletMarkerFootprintPx(mountView())).toBe(getFixedMarkerWidthPx() + 4);
      });
    });

    /**
     * Regression test for the *third* bug found live, in WKWebView
     * specifically (Safari Web Inspector attached to the running Tauri
     * window): a probe inserted and measured within the same synchronous
     * tick read back `marginRight: "0px"` there, even though the
     * identical CSS rule was simultaneously confirmed correct
     * (`marginRight: "4px"`) on the real, already-laid-out marker
     * element. Chrome/jsdom resolve `getComputedStyle` correctly either
     * way, so this can't be reproduced by asserting the *value* here —
     * this instead asserts the *mechanism* the fix relies on: a layout
     * read (`getBoundingClientRect`) on the probe happens before its
     * computed style is read, so a future edit that removes the forced
     * layout read (reintroducing the WKWebView bug) fails this test even
     * though it would still pass in Chrome/jsdom.
     */
    it('forces a layout read on the probe before reading its computed style', () => {
      const calls: string[] = [];
      const originalRect = HTMLElement.prototype.getBoundingClientRect;
      const originalGetComputedStyle = window.getComputedStyle;

      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        if (this.classList.contains('cm-bullet-list-marker--glyph')) calls.push('rect');
        return originalRect.call(this);
      });
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el, ...rest) => {
        if (el instanceof HTMLElement && el.classList.contains('cm-bullet-list-marker--glyph')) {
          calls.push('style');
        }
        return originalGetComputedStyle(el, ...rest);
      });

      getBulletMarkerFootprintPx(mountView());

      expect(calls).toEqual(['rect', 'style']);
    });

    /**
     * Regression test for the exact bug found live in a genuinely fresh
     * WKWebView/Tauri process (not stale HMR state): caching the
     * trailing-margin read made a single bad early measurement
     * (`marginRight: "0px"`, read before the page's own first layout
     * pass had settled) permanent, since nothing in the app ever calls
     * `refreshListMarkerWidthCache()` at runtime to invalidate it —
     * later, correct measurements never got a chance to overwrite it.
     * This asserts the fix directly: changing the real margin between
     * two calls, with **no** `refreshListMarkerWidthCache()` in between,
     * must be reflected on the very next call — proving this value is
     * recomputed every time, not cached at all.
     */
    it('is never cached — a margin change is reflected on the very next call with no refresh needed', () => {
      const view = mountView();

      withMarginRule('.cm-bullet-list-marker--glyph', 'margin-right: 4px;', () => {
        expect(getBulletMarkerFootprintPx(view)).toBe(getFixedMarkerWidthPx() + 4);
      });
      // The 4px rule's <style> tag has been removed now (withMarginRule's
      // own cleanup) — deliberately no refreshListMarkerWidthCache() call
      // here, since the whole point is that none should be needed.
      expect(getBulletMarkerFootprintPx(view)).toBe(getFixedMarkerWidthPx());

      withMarginRule('.cm-bullet-list-marker--glyph', 'margin-right: 9px;', () => {
        expect(getBulletMarkerFootprintPx(view)).toBe(getFixedMarkerWidthPx() + 9);
      });
    });
  });

  describe('getTaskMarkerFootprintPx', () => {
    it('is just the fixed box width when no trailing-margin rule is present (jsdom default)', () => {
      expect(getTaskMarkerFootprintPx(mountView())).toBe(getFixedMarkerWidthPx());
    });

    /**
     * Regression test for the exact bug found live: the task checkbox's
     * own trailing margin (`.cm-task-checkbox`'s `margin-right`) is
     * *negative* in the real app (`calc(var(--md-marker-text-gap) - 5px)`
     * = -1px) — the one marker kind whose gap shrinks the footprint
     * rather than growing it.
     */
    it('adds a negative .cm-task-checkbox margin-right, shrinking the footprint below the fixed box width', () => {
      withMarginRule('.cm-task-checkbox', 'margin-right: -1px;', () => {
        refreshListMarkerWidthCache();
        expect(getTaskMarkerFootprintPx(mountView())).toBe(getFixedMarkerWidthPx() - 1);
      });
    });
  });

  describe('getOrderedMarkerFootprintPx', () => {
    it('falls back to the fixed floor width when no canvas 2D context is available (e.g. an environment without the "canvas" package this repo\'s jsdom happens to have)', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      refreshListMarkerWidthCache();

      const view = mountView();
      expect(getOrderedMarkerFootprintPx(view, '1. ')).toBe(getFixedMarkerWidthPx());
      expect(getOrderedMarkerFootprintPx(view, '100. ')).toBe(getFixedMarkerWidthPx());
    });

    /**
     * This repo's jsdom (29.1.1) resolves a *real* canvas 2D context —
     * the `canvas` npm package is present (a transitive dependency of the
     * PDF-rendering feature), so `measureText()` here is genuine glyph
     * metrics, not a stub. This is a real, if not byte-identical-to-Chromium,
     * confirmation that wider markers measure wider — the exact-pixel
     * match against the app's real rendered font was verified live in the
     * running app (see this module's own doc comment for those numbers).
     */
    it('with the real canvas context, a wider marker never measures narrower than a narrower one', () => {
      const view = mountView();

      const one = getOrderedMarkerFootprintPx(view, '1. ');
      const ten = getOrderedMarkerFootprintPx(view, '10. ');
      const hundred = getOrderedMarkerFootprintPx(view, '100. ');

      expect(ten).toBeGreaterThanOrEqual(one);
      expect(hundred).toBeGreaterThan(ten);
    });

    /**
     * Reproduces `.cm-ordered-list-marker`'s own box model
     * (`min-width` floor, else measured content width + `padding-left`,
     * `box-sizing: border-box`) against a controllable fake canvas
     * context — this is the actual formula under test, independent of
     * jsdom's lack of real text-layout support. The real-font,
     * real-digit-width verification (confirming this formula matches
     * what the browser actually renders, including the "10." vs "99."
     * distinctness that ruled out a ch-based formula) was done live in
     * the running app — see this module's own doc comment.
     */
    it('uses max(floor, measured text width + padding) once a canvas context is available', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 10 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView();

      // "1. " -> 3 chars * 10 = 30, + 4px padding = 34, floor is 24 -> 34 wins.
      expect(getOrderedMarkerFootprintPx(view, '1. ')).toBe(34);
      // "100. " -> 5 chars * 10 = 50, + 4px padding = 54.
      expect(getOrderedMarkerFootprintPx(view, '100. ')).toBe(54);
    });

    it('falls back to the floor when the measured text is narrower than the floor', () => {
      const measureText = vi.fn(() => ({ width: 1 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView();

      expect(getOrderedMarkerFootprintPx(view, '1. ')).toBe(getFixedMarkerWidthPx());
    });

    it('a wider marker (more digits) never computes a smaller footprint than a narrower one', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 8.117 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView();

      const one = getOrderedMarkerFootprintPx(view, '1. ');
      const ten = getOrderedMarkerFootprintPx(view, '10. ');
      const hundred = getOrderedMarkerFootprintPx(view, '100. ');

      expect(ten).toBeGreaterThanOrEqual(one);
      expect(hundred).toBeGreaterThan(ten);
    });

    /** Regression test: the trailing margin is added on top of the measured box, not folded into it. */
    it('adds the real .cm-list-marker trailing margin on top of the measured/floored box width', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // box = floor
      withMarginRule('.cm-list-marker', 'margin-inline-end: 4px;', () => {
        refreshListMarkerWidthCache();
        const view = mountView();
        expect(getOrderedMarkerFootprintPx(view, '1. ')).toBe(getFixedMarkerWidthPx() + 4);
      });
    });

    /** Same .cm-editor-scoping regression as getBulletMarkerFootprintPx's own test, for the ordered marker's trailing-margin probe. */
    it('resolves a .cm-editor-scoped margin rule because the probe mounts inside view.dom', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // box = floor
      withMarginRule('.cm-editor .cm-list-marker', 'margin-inline-end: 4px;', () => {
        refreshListMarkerWidthCache();
        const view = mountView();
        expect(getOrderedMarkerFootprintPx(view, '1. ')).toBe(getFixedMarkerWidthPx() + 4);
      });
    });
  });

  describe('getTaskSeparatorWidthPx', () => {
    it('returns 0 for empty separator text without touching canvas at all', () => {
      const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
      expect(getTaskSeparatorWidthPx(mountView(), '')).toBe(0);
      expect(getContext).not.toHaveBeenCalled();
    });

    it('falls back to 0 when no canvas 2D context is available', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      refreshListMarkerWidthCache();
      expect(getTaskSeparatorWidthPx(mountView(), ' ')).toBe(0);
    });

    /**
     * Regression test for the exact bug found live: the real,
     * unconcealed separator space after a task checkbox's own `]` is
     * measured the same way the ordered marker's own digits are —
     * `CanvasRenderingContext2D.measureText()` against the real font,
     * never a hardcoded constant.
     */
    it('measures the real separator text via canvas.measureText, not a hardcoded constant', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 7 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView();
      expect(getTaskSeparatorWidthPx(view, ' ')).toBe(7);
      expect(getTaskSeparatorWidthPx(view, '   ')).toBe(21);
      expect(measureText).toHaveBeenCalledWith(' ');
    });

    it('reuses the same cached font read as the marker measurement (no independent, possibly-divergent font read)', () => {
      const view = mountView();
      const measureText = vi.fn(() => ({ width: 1 }));
      const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      getOrderedMarkerFootprintPx(view, '1. ');
      const contextObj = getContext.mock.results[0]!.value;
      const fontAfterOrdered = contextObj.font;

      getTaskSeparatorWidthPx(view, ' ');
      expect(contextObj.font).toBe(fontAfterOrdered);
    });
  });
});
