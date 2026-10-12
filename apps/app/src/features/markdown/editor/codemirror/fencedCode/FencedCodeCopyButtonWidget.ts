import { WidgetType } from '@codemirror/view';
import type { Rect } from '@codemirror/view';

import { recordInternalClipboardText } from '../paste/externalPaste';
import { coordsAtFencedCodeControlWidget } from './fencedCodeControlWidgetCoords';

const COPY_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor"/><path d="M11 5V3.5C11 2.67157 10.3284 2 9.5 2H3.5C2.67157 2 2 2.67157 2 3.5V9.5C2 10.3284 2.67157 11 3.5 11H5" stroke="currentColor"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.5L6.2 12L13 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * The Copy-to-clipboard control on a fenced code block's opening line —
 * same interactive-widget shape as `NoteEmbedWidget.ts`'s own
 * `makeButton` (a real `<button>`, `mousedown`/`click` both
 * `preventDefault()` + `stopPropagation()` so the click never moves the
 * caret or otherwise touches editor state, `ignoreEvent()` returns
 * `false` since the button's own listeners already fully own its events).
 * Reuses `.cm-media-control`'s existing icon-button chrome
 * (`MediaFloatingControls.css`) — the same visual system Image/PDF/note-
 * embed controls already use — rather than a fenced-code-specific button
 * style.
 *
 * `getCode` is called at click time, not capture time, so Copy always
 * reads the code as it exists the moment it's clicked rather than
 * whatever it was when this widget was constructed.
 *
 * `fencedCodeFrom` (the enclosing `FencedCode` node's own start position,
 * passed in purely for `eq()`) is what keeps this safe across
 * `fencedCodeCopyButtonDecoration.ts`'s per-doc-change rebuilds: CM6 skips
 * calling `toDOM()` again — reusing the *old* widget's DOM node and its
 * *old* `getCode` closure — whenever a newly constructed widget's `eq()`
 * says it's equivalent to the one already rendered. `getCode`'s own
 * closure captures this same node's position at construction time, so if
 * an edit elsewhere in the document shifted where this fenced block now
 * starts, reusing the old closure would silently copy from the wrong,
 * stale position. Keying `eq()` to `fencedCodeFrom` forces a fresh
 * widget (and therefore a fresh, correctly-positioned closure) exactly
 * when that position has actually changed, while still avoiding an
 * unnecessary DOM/closure rebuild — and the resulting one-frame
 * click-target flash back to "Copy" mid-feedback — for the common case
 * (typing inside the code body, which never moves the block's own start).
 */
export class FencedCodeCopyButtonWidget extends WidgetType {
  constructor(
    private readonly fencedCodeFrom: number,
    private readonly getCode: () => string
  ) {
    super();
  }

  override eq(other: FencedCodeCopyButtonWidget): boolean {
    return this.fencedCodeFrom === other.fencedCodeFrom;
  }

  override toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('cm-media-control', 'cm-code-block-copy');
    button.setAttribute('aria-label', 'Copy code');
    button.title = 'Copy code';
    button.innerHTML = COPY_ICON;

    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      // Denial (a real browser permission prompt dismissed, a non-secure
      // context, a sandboxed environment) is a legitimate outcome, not a
      // bug — the check/reset feedback simply never fires, leaving the
      // plain Copy icon in place, rather than surfacing as an unhandled
      // promise rejection.
      const code = this.getCode();
      navigator.clipboard.writeText(code).then(
        () => {
          // Clutter's own copy: pasting it back keeps its blank lines.
          recordInternalClipboardText(code);
          button.innerHTML = CHECK_ICON;
          button.classList.add('cm-code-block-copy--copied');
          clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            button.innerHTML = COPY_ICON;
            button.classList.remove('cm-code-block-copy--copied');
          }, 1500);
        },
        () => {
          // Clipboard write denied or unavailable — nothing further to do.
        }
      );
    });

    return button;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  // See `fencedCodeControlWidgetCoords.ts`'s own doc comment: this
  // button's `position: absolute` (MarkdownEditor.css) means its own DOM
  // rect is the wrong answer for "where is the document caret" whenever
  // the caret sits exactly at this widget's shared anchor position —
  // without this override, CM6's default `coordsAt` fallback would use
  // that displaced rect instead.
  override coordsAt(dom: HTMLElement): Rect | null {
    return coordsAtFencedCodeControlWidget(dom);
  }
}
