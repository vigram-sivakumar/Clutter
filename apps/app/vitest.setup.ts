import { setSystemLocaleOverride } from './src/shared/helpers/time/dateLocale';

/**
 * Shared jsdom polyfills for every test file, registered once via
 * `vite.config.ts`'s `test.setupFiles` rather than duplicated per test
 * file (the project's existing convention — ResizeObserver/IntersectionObserver
 * stubs, `Image` capture — is deliberately *local* to each test file when
 * the behavior needs per-test control; this one doesn't, and every CM6-
 * mounting test needs it identically, so it belongs here instead).
 *
 * jsdom (confirmed directly against the installed version, 29.1.1) never
 * implements `Range.prototype.getClientRects`/`getBoundingClientRect` at
 * all — unlike `Element.prototype.getClientRects`, which jsdom *does*
 * implement, always returning an empty list since jsdom performs no real
 * layout. CodeMirror's own text-measurement path (`clientRectsFor`,
 * `@codemirror/view`) calls `.getClientRects()` on a `Range` for every
 * text node it measures — with no polyfill, this hits a real
 * `TypeError: ... .getClientRects is not a function` the moment CM6's
 * deferred `measure()` (queued via `requestAnimationFrame`) fires, which
 * jsdom's fake `requestAnimationFrame` still does even in tests that never
 * explicitly wait for it. This crash surfaced as an *unhandled* exception
 * after individual tests had already finished/passed — never attributable
 * to one call site or fixable by changing application code, since no
 * application code calls `Range.getClientRects` directly; only CM6's own
 * internals do.
 *
 * Mirrors jsdom's own `Element.getClientRects`/`getBoundingClientRect`
 * stub shape exactly (a plain empty array; a plain zeroed DOMRect-shaped
 * object) — the same "no real layout, always empty/zero" contract jsdom
 * already gives every other measurement API, so CM6 (and any test
 * asserting on rect values) sees one consistent, already-established
 * answer rather than a second, differently-shaped stub.
 */
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  const zeroRect = (): DOMRect =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    }) as DOMRect;

  Range.prototype.getClientRects = function (): DOMRectList {
    return [] as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return zeroRect();
  };
}

/**
 * Date labels follow the system locale (`shared/helpers/time/dateLocale.ts`), which would otherwise be
 * whatever the machine running the tests uses. Pinned for every test; a test that is about a locale passes
 * its own (`{ locale }` to a formatter, or `setSystemLocaleOverride`).
 */
setSystemLocaleOverride('en-IN');
