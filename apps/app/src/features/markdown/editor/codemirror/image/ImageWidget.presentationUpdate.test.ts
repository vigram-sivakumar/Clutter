// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { imageLivePreview } from './imageLivePreview';
import { getImageUiState, presentationOnlyEdit, setImageUiState, type ImageDisplayMode } from './imageUiState';
import { getImagePresentation, computeImagePresentationUpdate } from '../mediaPresentation/mediaPresentationUpdate';

/**
 * Regression coverage for the presentation-update flicker fix: switching
 * Fill↔Fit (or changing width/alignment) must patch the *existing* mounted
 * widget/`<img>` in place (`ImageWidget.updateDOM`, CM6's own "lightweight
 * DOM update" pattern) rather than tearing the widget down and rebuilding
 * it — and must never route through `imageUiState.ts`'s pessimistic
 * `broken`-forcing block (`presentationOnlyEdit`), which is the actual
 * root cause the reported flicker traced back to. Same `new Image()`-
 * capturing pattern established elsewhere in this file family.
 */
let capturedProbes: HTMLImageElement[] = [];
let OriginalImage: typeof Image;

beforeEach(() => {
  capturedProbes = [];
  OriginalImage = window.Image;
  class CapturingImage extends OriginalImage {
    constructor(width?: number, height?: number) {
      super(width, height);
      capturedProbes.push(this);
    }
  }
  vi.stubGlobal('Image', CapturingImage);
});

afterEach(() => {
  vi.stubGlobal('Image', OriginalImage);
});

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

function settleAllProbes(): void {
  for (const probe of capturedProbes) {
    probe.dispatchEvent(new Event('load'));
  }
}

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [history(), markdownLanguageExtension(), imageLivePreview(() => () => {}, () => () => {})],
  });
  const view = new EditorView({ state, parent });
  settleAllProbes();
  return view;
}

function getContainer(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-image-container');
  if (!el) throw new Error('image container not found');
  return el;
}

function getImg(view: EditorView): HTMLImageElement {
  const el = view.dom.querySelector<HTMLImageElement>('img.tok-image');
  if (!el) throw new Error('img not found');
  return el;
}

/**
 * Replicates exactly what `MarkdownEditor.tsx`'s
 * `handleSelectImageDisplayMode` dispatches — the real integration this
 * test exercises, not a simplified stand-in. `pos`/`to` are mapped
 * through the same `changes` this transaction also carries (via
 * `view.state.changes(...)`) before building the effect — see that
 * function's own doc comment for why: `setImageUiState`'s `pos`/`to`
 * must be given in the transaction's *post*-change coordinate space,
 * and `changes` rewrites the node's own pipe segment, which almost
 * always shifts its length. Passing pre-change positions unmapped here
 * reproduced the exact same `RangeError: Position N is out of range for
 * changeset of length M` crash that bug fix addressed at the real call
 * site — confirmed directly while adding the container-height FLIP
 * tests below, not merely inferred.
 */
function selectMode(view: EditorView, pos: number, to: number, mode: ImageDisplayMode): void {
  const ui = getImageUiState(view.state, pos, to);
  const current = getImagePresentation(view.state, to);
  const changes = computeImagePresentationUpdate(view.state, to, { ...current, mode });
  const mappedChanges = view.state.changes(changes);
  view.dispatch({
    effects: [
      setImageUiState.of({ pos: mappedChanges.mapPos(pos), to: mappedChanges.mapPos(to, 1), state: { ...ui, displayMode: mode } }),
      presentationOnlyEdit.of(null),
    ],
    changes,
  });
  settleAllProbes();
}

const IMAGE_MD = '![Photo](https://example.com/a.jpg)';

describe('presentation-update flicker fix', () => {
  it('Fill → Fit reuses the same mounted <img> element (no unmount/remount)', () => {
    const view = mountView(IMAGE_MD);
    const imgBefore = getImg(view);
    const containerBefore = getContainer(view);

    selectMode(view, 0, IMAGE_MD.length, 'fit');

    expect(getImg(view)).toBe(imgBefore);
    expect(getContainer(view)).toBe(containerBefore);
  });

  it('Fit → Fill reuses the same mounted <img> element', () => {
    const view = mountView('![Photo|fit](https://example.com/a.jpg)');
    const imgBefore = getImg(view);

    selectMode(view, 0, view.state.doc.length, 'fill');

    expect(getImg(view)).toBe(imgBefore);
  });

  it('a width change does not re-probe or reload the image source', () => {
    const view = mountView(IMAGE_MD);
    const probesBefore = capturedProbes.length;
    const srcBefore = getImg(view).src;

    const to = view.state.doc.length;
    const current = getImagePresentation(view.state, to);
    view.dispatch({
      changes: computeImagePresentationUpdate(view.state, to, { ...current, width: 6 }),
      effects: presentationOnlyEdit.of(null),
    });
    settleAllProbes();

    expect(capturedProbes.length).toBe(probesBefore); // no new probe created
    expect(getImg(view).src).toBe(srcBefore); // <img src> never touched
  });

  it('an alignment change does not re-probe or reload the image source', () => {
    const view = mountView(IMAGE_MD);
    const probesBefore = capturedProbes.length;
    const imgBefore = getImg(view);

    const to = view.state.doc.length;
    const current = getImagePresentation(view.state, to);
    view.dispatch({
      changes: computeImagePresentationUpdate(view.state, to, { ...current, alignment: 'center' }),
      effects: presentationOnlyEdit.of(null),
    });
    settleAllProbes();

    expect(capturedProbes.length).toBe(probesBefore);
    expect(getImg(view)).toBe(imgBefore);
    expect(getContainer(view).dataset.align).toBe('center');
  });

  it('mode changes never surface the broken card — the presentation-only marker keeps the pessimistic broken-forcing block from firing', () => {
    const view = mountView(IMAGE_MD);
    selectMode(view, 0, IMAGE_MD.length, 'fit');
    selectMode(view, 0, view.state.doc.length, 'fill');

    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
    expect(getImg(view)).not.toBeNull();
  });

  it('Markdown is updated in place — no duplicate metadata is appended', () => {
    const view = mountView('![Photo|695,center,fit](https://example.com/a.jpg)');
    selectMode(view, 0, view.state.doc.length, 'fill');

    // Fill is the default mode, so it is omitted from the canonical form.
    expect(view.state.doc.toString()).toBe('![Photo|695,center](https://example.com/a.jpg)');
    expect(view.state.doc.toString().match(/\|/g)?.length).toBe(1);
  });

  it('a genuine content edit (URL change) still rebuilds the widget normally — the flicker fix does not suppress real broken-state detection', () => {
    // Surrounding content + caret parked elsewhere so the image starts
    // genuinely at rest (not "freshly typed this transaction") before the
    // content edit — matching a real already-rendered image being edited,
    // not a construct still in its own creation window.
    const prefix = 'Before.\n\n';
    const view = mountView(prefix + IMAGE_MD);
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull(); // at rest, concealed

    const urlStart = prefix.length + 9;
    const urlEnd = prefix.length + IMAGE_MD.length - 1;
    // Edit the URL itself (the text strictly inside the parens) — a real
    // content change, no presentationOnlyEdit marker.
    view.dispatch({
      changes: { from: urlStart, to: urlEnd, insert: 'https://example.com/broken.jpg' },
      selection: { anchor: 0 },
    });
    expect(view.dom.querySelector('.cm-image-broken')).not.toBeNull();
  });
});

/**
 * Regression coverage for a real, reported Fill↔Fit transition asymmetry:
 * Fill→Fit looked smooth, Fit→Fill snapped instantly. Root cause:
 * `.cm-image-container`'s own `height` was never part of the FLIP
 * (measure-pin-release) sequence `updateDOM` already ran for `width` and
 * the `<img>`'s own width/height — only `.cm-image-container--fill`
 * declares an explicit `height` (`400px`) *and* `overflow: hidden`
 * together, and both took effect the instant the class swapped. Going
 * Fit→Fill, if the Fit-mode image was taller than 400px, the container
 * clipped to exactly 400px on the very first frame, before the image's
 * own (still-correctly-animating) height had moved at all — nothing above
 * 400px was ever visible to interpolate, a real snap. Going Fill→Fit
 * happened to look smooth only by accident: Fit's container has no fixed
 * height at all (`auto`), so it continuously re-derived from the
 * `<img>`'s own already-animating height, frame by frame, with no
 * transition of its own needed. Fixed by adding the container's own
 * `height` to the same FLIP call, and a matching `transition: height`
 * declaration on `.cm-image-container` (MarkdownEditor.css) — see both
 * files' own doc comments for the full mechanism.
 */
describe('Fill ↔ Fit container height transition (bidirectional FLIP fix)', () => {
  function stubRect(el: HTMLElement, rects: { fit: DOMRect; fill: DOMRect }): void {
    el.getBoundingClientRect = () =>
      el.classList.contains('cm-image-container--fill') || el.classList.contains('tok-image--fill')
        ? rects.fill
        : rects.fit;
  }

  function rect(width: number, height: number): DOMRect {
    return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) } as DOMRect;
  }

  it('MarkdownEditor.css: .cm-image-container transitions height, not just width', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'MarkdownEditor.css'), 'utf8');
    const match = css.match(/\.cm-editor\s+\.cm-image-container\s*\{([^}]*)\}/);
    expect(match, '.cm-image-container rule not found').not.toBeNull();
    const body = match![1]!;
    expect(body).toMatch(/transition\s*:[^;]*width\s+160ms\s+ease[^;]*;/s);
    expect(body).toMatch(/transition\s*:[^;]*height\s+160ms\s+ease[^;]*;/s);
  });

  it('Fit → Fill: the container\'s own height is FLIP-pinned (an inline height style is applied), not left to snap instantly to the class-driven 400px', () => {
    const view = mountView('![Photo|fit](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    // A Fit-mode image taller than Fill's fixed 400px — the exact shape
    // that produced a real, visible snap before this fix (the container
    // clipping to 400px before the image's own height transition moved).
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    expect(container.style.height).toBe('');

    selectMode(view, 0, view.state.doc.length, 'fill');

    // `flipDimensionTransition` sets the *target* value as the very last
    // step of its own synchronous pin-then-release sequence (see that
    // function's own doc comment) — by the time dispatch returns, the
    // inline style already holds the "to" pixel value, not the
    // transient "from" one; jsdom never fires a real `transitionend`, so
    // it stays pinned rather than being cleaned back up. Its mere
    // presence (a concrete pixel value, not empty/unset) is what proves
    // the container's height is now part of the same FLIP-driven
    // transition path `width` already used — before this fix, this
    // style was never touched at all for `height`.
    expect(container.style.height).toBe('400px');
  });

  it('Fill → Fit: the container\'s own height is also explicitly FLIP-pinned now (previously implicit, via auto tracking the <img>)', () => {
    const view = mountView('![Photo|fill](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    selectMode(view, 0, view.state.doc.length, 'fit');

    expect(container.style.height).toBe('900px');
  });

  it('repeated Fit ↔ Fill ↔ Fit toggling keeps pinning height symmetrically in both directions', () => {
    const view = mountView('![Photo|fit](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    selectMode(view, 0, view.state.doc.length, 'fill');
    expect(container.style.height).toBe('400px');

    selectMode(view, 0, view.state.doc.length, 'fit');
    expect(container.style.height).toBe('900px');

    selectMode(view, 0, view.state.doc.length, 'fill');
    expect(container.style.height).toBe('400px');
  });
});

/**
 * Regression coverage for a real, confirmed bug found *after* the FLIP
 * fix above shipped: `.cm-image-container` retained an inline
 * `height: 400px` permanently after switching Fill → Fit, instead of
 * falling back to Fit's own declarative `height: auto`. Root cause:
 * `flipDimensionTransition`'s cleanup only ever ran on `transitionend` —
 * see `mediaLayoutStyle.ts`'s own doc comment (and its dedicated unit
 * tests, `mediaLayoutStyle.test.ts`) for the full mechanism (an
 * interrupted transition fires `transitioncancel`, never `transitionend`,
 * so a superseded call's own cleanup closure leaked forever, which could
 * poison a later switch's own size measurement into never detecting a
 * genuine change at all). These tests exercise the *same* bug at the
 * `ImageWidget` integration level: simulating the browser actually
 * finishing the transition (`transitionend`) and asserting the inline
 * `height` is gone afterward, in both directions and across repeated
 * toggling.
 */
describe('Fill ↔ Fit — no stale inline height survives after the transition settles', () => {
  function stubRect(el: HTMLElement, rects: { fit: DOMRect; fill: DOMRect }): void {
    el.getBoundingClientRect = () =>
      el.classList.contains('cm-image-container--fill') || el.classList.contains('tok-image--fill')
        ? rects.fill
        : rects.fit;
  }

  function rect(width: number, height: number): DOMRect {
    return { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) } as DOMRect;
  }

  /** Simulates the browser genuinely finishing a CSS transition on `el` for `property` — the event `flipDimensionTransition`'s own cleanup listens for. */
  function settleTransition(el: HTMLElement, property: 'width' | 'height'): void {
    el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: property }));
  }

  it('Fill → Fit: once the transition settles, the container does NOT retain an inline height:400px — it falls back to Fit\'s own height:auto', () => {
    const view = mountView('![Photo|fill](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    selectMode(view, 0, view.state.doc.length, 'fit');
    expect(container.style.height).toBe('900px'); // mid-transition pin, expected

    settleTransition(container, 'height');

    expect(container.style.height).toBe(''); // released — Fit's declarative height:auto governs again
    expect(container.classList.contains('cm-image-container--fit')).toBe(true);
    expect(container.classList.contains('cm-image-container--fill')).toBe(false);
  });

  it('Fit → Fill: once the transition settles, the container does not retain a stale inline height either (it may rely on Fill\'s own declarative height:400px once released)', () => {
    const view = mountView('![Photo|fit](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    selectMode(view, 0, view.state.doc.length, 'fill');
    expect(container.style.height).toBe('400px');

    settleTransition(container, 'height');

    expect(container.style.height).toBe(''); // released — Fill's own declarative height:400px governs again
    expect(container.classList.contains('cm-image-container--fill')).toBe(true);
  });

  it('repeated Fit → Fill → Fit → Fill → Fit, settling each transition in turn, never leaves a stale inline height at any step', () => {
    const view = mountView('![Photo|fit](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    const sequence: Array<ImageDisplayMode> = ['fill', 'fit', 'fill', 'fit'];
    for (const mode of sequence) {
      selectMode(view, 0, view.state.doc.length, mode);
      expect(container.style.height).toBe(mode === 'fill' ? '400px' : '900px');
      settleTransition(container, 'height');
      expect(container.style.height).toBe('');
      expect(container.classList.contains(`cm-image-container--${mode}`)).toBe(true);
    }
  });

  it('repeated toggling WITHOUT ever settling the intermediate transitions (each one interrupted by the next) still ends up clean once the FINAL transition settles — the interrupted-transition/transitioncancel fix, exercised through the real widget', () => {
    const view = mountView('![Photo|fit](https://example.com/a.jpg)');
    const container = getContainer(view);
    const img = getImg(view);
    stubRect(container, { fit: rect(600, 900), fill: rect(600, 400) });
    stubRect(img, { fit: rect(600, 900), fill: rect(600, 400) });

    // Three rapid toggles, none of them settled in between — each
    // supersedes the previous one's still-pending transition.
    selectMode(view, 0, view.state.doc.length, 'fill');
    selectMode(view, 0, view.state.doc.length, 'fit');
    selectMode(view, 0, view.state.doc.length, 'fill');
    expect(container.style.height).toBe('400px');

    // The browser would fire `transitioncancel` for each interrupted
    // transition and `transitionend` only for the last, real one — the
    // net effect on the DOM is identical either way, since both drive
    // the exact same cleanup (mediaLayoutStyle.ts).
    settleTransition(container, 'height');

    expect(container.style.height).toBe('');
    expect(container.classList.contains('cm-image-container--fill')).toBe(true);
  });
});
