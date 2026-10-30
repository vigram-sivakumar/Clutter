import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Lines of space kept between the caret and the top of the bottom fade once the page has to scroll. */
const BREATHING_LINES = 2.5;
const FALLBACK_FADE_HEIGHT = 48;
const FALLBACK_LINE_HEIGHT = 24;

function readPx(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * How far above the scroller's bottom edge the caret must stay: the page's bottom fade
 * (`--page-bottom-fade-height`, Page.css), which covers the text, plus a few lines of breathing room.
 * Read at scroll time so it follows the font size and the token.
 */
export function caretBottomClearance(view: EditorView): number {
  const fade = readPx(getComputedStyle(view.dom).getPropertyValue('--page-bottom-fade-height'), FALLBACK_FADE_HEIGHT);
  const lineHeight = readPx(getComputedStyle(view.contentDOM).lineHeight, FALLBACK_LINE_HEIGHT);
  return fade + BREATHING_LINES * lineHeight;
}

/**
 * Keeps the caret clear of the page's bottom fade while typing. CM6's native scroll-into-view already scrolls
 * the page's scroller (it walks up from the overflow-visible `.cm-scroller`) but stops 5px from the edge,
 * under the fade. `scrollMargins` (not `cursorScrollMargin`, which is clamped to the editor's own height and
 * is meant for the cursor's distance rather than for an element covering the edge) widens the rectangle CM6
 * scrolls into view, only when a scroll is requested — so manual scrolling is never fought.
 *
 * Main page editor only: embeds, reference previews and table-cell editors do not install it.
 */
export function caretBottomClearanceExtension(): Extension {
  return EditorView.scrollMargins.of((view) => ({ bottom: caretBottomClearance(view) }));
}
