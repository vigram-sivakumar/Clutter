// @vitest-environment jsdom
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

/** Replicates exactly what `MarkdownEditor.tsx`'s `handleSelectImageDisplayMode` dispatches — the real integration this test exercises, not a simplified stand-in. */
function selectMode(view: EditorView, pos: number, to: number, mode: ImageDisplayMode): void {
  const ui = getImageUiState(view.state, pos, to);
  const current = getImagePresentation(view.state, to);
  view.dispatch({
    effects: [setImageUiState.of({ pos, to, state: { ...ui, displayMode: mode } }), presentationOnlyEdit.of(null)],
    changes: computeImagePresentationUpdate(view.state, to, { ...current, mode }),
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
