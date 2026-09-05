// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { imageLivePreview } from '../image/imageLivePreview';
import { embedLivePreview } from '../embed/embedLivePreview';
import type { EmbedImageResolution, ResolveEmbedImage } from '../embed/embedImageResolution';
import type { EmbedPdfResolution, ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import { computeImagePresentationUpdate, getImagePresentation } from './mediaPresentationUpdate';
import { presentationOnlyEdit } from '../image/imageUiState';

/**
 * Regression coverage for the alignment-UX fix: media alignment
 * (`data-align`) must only ever move the rendered widget container —
 * never the raw Markdown line it lives on. A prior version of
 * `MarkdownEditor.css` set `text-align` on `.cm-line` via `:has()`, which
 * is the same DOM node the raw source renders into once the construct is
 * revealed for editing — these tests assert the line itself never carries
 * an alignment-driven `text-align`, in both rendered and revealed states.
 */

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        })
      ),
      destroy: vi.fn(),
    }),
    destroy: vi.fn(),
  })),
  OutputScale: class {
    sx = 1;
    sy = 1;
    get scaled() {
      return false;
    }
  },
}));
vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => {
  class FakeTextLayerBuilder {
    div: HTMLDivElement;
    constructor() {
      this.div = document.createElement('div');
      this.div.className = 'textLayer';
    }
    async render() {}
    cancel() {}
  }
  return { TextLayerBuilder: FakeTextLayerBuilder };
});

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

function mountImageView(doc: string, anchor = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [history(), markdownLanguageExtension(), imageLivePreview(() => () => {}, () => () => {})],
  });
  const view = new EditorView({ state, parent });
  settleAllProbes();
  return view;
}

function imageResolverFor(entries: Record<string, EmbedImageResolution>): ResolveEmbedImage {
  return (path, alias) => entries[path] ?? { status: 'unresolved', alt: alias ?? path };
}
function pdfResolverFor(entries: Record<string, EmbedPdfResolution>): ResolveEmbedPdf {
  return (path) => entries[path] ?? { status: 'non-pdf' };
}

function mountPdfView(doc: string, anchor = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const resolveEmbedImage = imageResolverFor({ 'document.pdf': { status: 'non-image' } });
  const resolveEmbedPdf = pdfResolverFor({
    'document.pdf': { status: 'pdf', url: 'app://vault/document.pdf', title: 'document.pdf', path: 'document.pdf', resourceId: 'r1' },
  });
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      history(),
      markdownLanguageExtension(),
      embedLivePreview(
        () => resolveEmbedImage,
        () => undefined,
        () => undefined,
        () => resolveEmbedPdf,
        () => () => {},
        () => () => {}
      ),
    ],
  });
  return new EditorView({ state, parent });
}

function lineTextAlign(view: EditorView): string {
  const line = view.dom.querySelector<HTMLElement>('.cm-line');
  if (!line) {
    throw new Error('.cm-line not found');
  }
  return getComputedStyle(line).textAlign;
}

function typeAt(view: EditorView, pos: number, text: string): void {
  view.dispatch({ changes: { from: pos, to: pos, insert: text }, selection: { anchor: pos + text.length } });
  settleAllProbes();
}

describe('media alignment UX — the raw Markdown line never moves', () => {
  it('rendered center-aligned image: .cm-line keeps normal (left/start) text-align', () => {
    const view = mountImageView('![Photo|6,center](photo.jpg)');
    const container = view.dom.querySelector<HTMLElement>('.cm-image-container');
    expect(container?.dataset.align).toBe('center');
    expect(lineTextAlign(view)).not.toBe('center');
  });

  it('rendered right-aligned image: .cm-line keeps normal (left/start) text-align', () => {
    const view = mountImageView('![Photo|6,right](photo.jpg)');
    const container = view.dom.querySelector<HTMLElement>('.cm-image-container');
    expect(container?.dataset.align).toBe('right');
    expect(lineTextAlign(view)).not.toBe('right');
  });

  it('rendered left-aligned (default) image: no data-align attribute, .cm-line unaffected', () => {
    const view = mountImageView('![Photo](photo.jpg)');
    const container = view.dom.querySelector<HTMLElement>('.cm-image-container');
    expect(container?.dataset.align).toBeUndefined();
    expect(lineTextAlign(view)).not.toBe('center');
    expect(lineTextAlign(view)).not.toBe('right');
  });

  it('rendered center-aligned PDF embed: .cm-line keeps normal text-align', () => {
    const view = mountPdfView('![[document.pdf|6,center]]');
    const container = view.dom.querySelector<HTMLElement>('.cm-pdf-embed-container');
    expect(container?.dataset.align).toBe('center');
    expect(lineTextAlign(view)).not.toBe('center');
  });

  it('rendered right-aligned PDF embed: .cm-line keeps normal text-align', () => {
    const view = mountPdfView('![[document.pdf|6,right]]');
    const container = view.dom.querySelector<HTMLElement>('.cm-pdf-embed-container');
    expect(container?.dataset.align).toBe('right');
    expect(lineTextAlign(view)).not.toBe('right');
  });

  it('switching alignment while rendered (a real presentation-update transaction, same path a resize/menu commit uses) updates only the container attribute, never .cm-line', () => {
    const view = mountImageView('![Photo|6,left](photo.jpg)');
    expect(lineTextAlign(view)).not.toBe('center');

    const nodeEnd = view.state.doc.length;
    const current = getImagePresentation(view.state, nodeEnd);
    view.dispatch({
      changes: computeImagePresentationUpdate(view.state, nodeEnd, { ...current, alignment: 'center' }),
      effects: presentationOnlyEdit.of(null),
    });
    settleAllProbes();
    const container = view.dom.querySelector<HTMLElement>('.cm-image-container');
    expect(container?.dataset.align).toBe('center');
    expect(lineTextAlign(view)).not.toBe('center');

    const nodeEnd2 = view.state.doc.length;
    const current2 = getImagePresentation(view.state, nodeEnd2);
    view.dispatch({
      changes: computeImagePresentationUpdate(view.state, nodeEnd2, { ...current2, alignment: 'right' }),
      effects: presentationOnlyEdit.of(null),
    });
    settleAllProbes();
    const container2 = view.dom.querySelector<HTMLElement>('.cm-image-container');
    expect(container2?.dataset.align).toBe('right');
    expect(lineTextAlign(view)).not.toBe('right');
  });

  it('entering raw edit mode on a center-aligned image immediately returns the line to normal left-aligned text', () => {
    const prefix = 'Before.\n\n';
    const doc = '![Photo|6,center](photo.jpg)';
    const view = mountImageView(prefix + doc, 0);
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull();

    // Typing inside the node's alt text is the same "still mid-edit, stay
    // raw" trigger `imageMediaPresentationLifecycle.test.ts` already
    // establishes — the widget disappears and the line renders its own
    // raw source while the caret is inside.
    typeAt(view, prefix.length + 5, 'X');
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('|6,center](photo.jpg)');
    expect(lineTextAlign(view)).not.toBe('center');
    expect(lineTextAlign(view)).not.toBe('right');
  });

  it('entering raw edit mode on a right-aligned image immediately returns the line to normal left-aligned text', () => {
    const prefix = 'Before.\n\n';
    const doc = '![Photo|6,right](photo.jpg)';
    const view = mountImageView(prefix + doc, 0);
    expect(view.dom.querySelector('.cm-image-container')).not.toBeNull();

    typeAt(view, prefix.length + 5, 'X');
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('|6,right](photo.jpg)');
    expect(lineTextAlign(view)).not.toBe('center');
    expect(lineTextAlign(view)).not.toBe('right');
  });
});
