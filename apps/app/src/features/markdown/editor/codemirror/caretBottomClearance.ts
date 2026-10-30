import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Lines of space kept between the caret and the top of the bottom fade once the page has to scroll. */
const BREATHING_LINES = 2.5;
const FALLBACK_FADE_HEIGHT = 48;
const FALLBACK_LINE_HEIGHT = 24;
/** CM6's own default for the horizontal axis, kept as is. */
const HORIZONTAL_MARGIN = 5;

function readPx(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * How far from the page scroller's edge the caret must stay: the page's bottom fade
 * (`--page-bottom-fade-height`, Page.css), which covers the text, plus a few lines of breathing room.
 * The line height is the editor's own (`--cm-content` × `--lh-cm-content`), read from `root`.
 */
export function caretBottomClearance(root: HTMLElement): number {
  const style = getComputedStyle(root);
  const fade = readPx(style.getPropertyValue('--page-bottom-fade-height'), FALLBACK_FADE_HEIGHT);
  const fontSize = readPx(style.getPropertyValue('--cm-content'), FALLBACK_LINE_HEIGHT / 1.5);
  const lineHeightRatio = readPx(style.getPropertyValue('--lh-cm-content'), 1.5);
  return fade + BREATHING_LINES * fontSize * lineHeightRatio;
}

/**
 * Keeps the caret clear of the page's bottom fade while typing. CM6's native scroll-into-view already scrolls
 * the page's scroller (it walks up from the overflow-visible `.cm-scroller`) but stops 5px from the edge,
 * under the fade, so this raises that distance with `cursorScrollMargin`.
 *
 * Not `scrollMargins`: CM6's tooltip placement treats that region as covered and parks any tooltip whose
 * caret falls inside it off-screen (y ≈ -10000), which hid every autocomplete popup (`[[`, `@`, `#`, `![[`)
 * typed within that distance of the end of the note. `cursorScrollMargin` only affects scrolling. The cost is
 * that it applies to both edges, and CM6 caps it at the editor's own height.
 *
 * Read once when the editor is built. Main page editor only: embeds, reference previews and table-cell editors
 * do not install it.
 */
export function caretBottomClearanceExtension(root: HTMLElement = document.documentElement): Extension {
  return EditorView.cursorScrollMargin.of({ x: HORIZONTAL_MARGIN, y: caretBottomClearance(root) });
}
