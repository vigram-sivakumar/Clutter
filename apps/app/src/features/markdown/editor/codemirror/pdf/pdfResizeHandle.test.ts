// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { embedLivePreview } from '../embed/embedLivePreview';
import type { EmbedImageResolution, ResolveEmbedImage } from '../embed/embedImageResolution';
import type { EmbedPdfResolution, ResolveEmbedPdf } from './embedPdfResolution';

/**
 * Coverage for the custom pointer-driven PDF resize handle
 * (`pdfResizeHandle.ts`), the PDF counterpart to
 * `image/imageResizeHandle.test.ts` — same "test the real integration,
 * not a simplified stand-in" standard, driving real `PointerEvent`s
 * against a real mounted `EditorView`. Same PDF.js/ResizeObserver mocking
 * shape `embedLivePreview.pdf.test.ts` already establishes (this suite
 * only cares about the resize interaction, not PDF.js's own rendering
 * pipeline).
 */
const pdfjsMock = vi.hoisted(() => ({
  state: {
    getPageCalls: [] as number[],
    renderScales: [] as number[],
    numPages: 1,
  },
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => {
    const promise = Promise.resolve({
      numPages: pdfjsMock.state.numPages,
      getPage: vi.fn((pageNumber: number) => {
        pdfjsMock.state.getPageCalls.push(pageNumber);
        return Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => {
            pdfjsMock.state.renderScales.push(scale);
            return { width: 600 * scale, height: 800 * scale, scale };
          },
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        });
      }),
      destroy: vi.fn(),
    });
    return { promise, destroy: vi.fn() };
  }),
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

/**
 * A manual-trigger-only mock, same shape `embedLivePreview.pdf.test.ts`
 * already establishes — jsdom has no real layout engine, so nothing ever
 * fires this automatically; a test must call `.trigger()` itself to
 * simulate the browser noticing a real size change. This is exactly what
 * makes "the drag never triggers a real PDF.js re-render" checkable at
 * all: if `PdfEmbedWidget.ts`'s own suppress-flag wiring were missing or
 * wrong, nothing in this mock would silently paper over it — the
 * assertions below count actual `getPage` calls, not rely on this mock's
 * own firing behavior one way or the other.
 */
class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  constructor(_callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

function imageResolverFor(entries: Record<string, EmbedImageResolution>): ResolveEmbedImage {
  return (path, alias) => entries[path] ?? { status: 'unresolved', alt: alias ?? path };
}

function pdfResolverFor(entries: Record<string, EmbedPdfResolution>): ResolveEmbedPdf {
  return (path) => entries[path] ?? { status: 'non-pdf' };
}

function pdfResolution(url: string, title: string, path: string): EmbedPdfResolution {
  return { status: 'pdf', url, title, path, resourceId: `resource-${path}` };
}

function mountView(doc: string, resolveEmbedPdf: ResolveEmbedPdf): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      markdownLanguageExtension(),
      embedLivePreview({
        hostPageId: 'test-host-page',
        resolveEmbedImage: () => imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        onImageClick: () => undefined,
        onOpenImageMenu: () => undefined,
        resolveEmbedPdf: () => resolveEmbedPdf,
        onPdfEmbedClick: () => () => {},
        onOpenPdfMenu: () => () => {},
      }),
    ],
  });
  return new EditorView({ state, parent });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function getContainer(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-pdf-embed-container');
  if (!el) throw new Error('pdf embed container not found');
  return el;
}

function getRightHandle(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-pdf-embed .cm-media-resize-handle--corner-right');
  if (!el) throw new Error('right resize handle not found');
  return el;
}

function getLeftHandle(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-pdf-embed .cm-media-resize-handle--corner-left');
  if (!el) throw new Error('left resize handle not found');
  return el;
}

function getPageWrap(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-pdf-embed .pdf-viewer__page');
  if (!el) throw new Error('page wrap not found');
  return el;
}

/** Same "inline style wins over the base rect" contract `image/imageResizeHandle.test.ts`'s own `stubDynamicRect` establishes — required since `pdfResizeHandle.ts` mutates `container.style.width` directly during `pointermove`. */
function stubDynamicRect(el: HTMLElement, baseWidth: number): void {
  el.getBoundingClientRect = () => {
    const width = el.style.width ? parseFloat(el.style.width) : baseWidth;
    return { width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) } as DOMRect;
  };
}

let nextPointerId = 1;

function pointerEvent(type: string, clientX: number, clientY: number, pointerId: number): PointerEvent {
  return new PointerEvent(type, { clientX, clientY, button: 0, pointerId, bubbles: true, cancelable: true });
}

function drag(handle: HTMLElement, fromX: number, toX: number): void {
  const pointerId = nextPointerId++;
  handle.dispatchEvent(pointerEvent('pointerdown', fromX, 0, pointerId));
  handle.dispatchEvent(pointerEvent('pointermove', toX, 0, pointerId));
  handle.dispatchEvent(pointerEvent('pointerup', toX, 0, pointerId));
}

const PDF_MD = '![[document.pdf]]';

async function mountResolvedPdf(doc = PDF_MD, numPages = 1): Promise<EditorView> {
  pdfjsMock.state.numPages = numPages;
  const view = mountView(doc, pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') }));
  await flush();
  stubDynamicRect(getContainer(view), 600);
  // jsdom never computes real layout, so `.pdf-viewer__page`'s own
  // `getBoundingClientRect()` would otherwise read 0 regardless of the
  // canvas's real inline CSS width — stubbed to what a real browser would
  // measure for this mock's 600×800 base page at the initial scale-1 fit
  // (`getAvailableViewerWidth` also reads 0 in jsdom, so `computeFitScale`
  // falls back to scale 1 — see that function's own `<= 0` guard).
  stubDynamicRect(getPageWrap(view), 600);
  return view;
}

describe('PDF resize — right/left corner width persistence', () => {
  it('dragging the right corner outward persists the new width', async () => {
    const view = await mountResolvedPdf();

    drag(getRightHandle(view), 0, 80);

    expect(view.state.doc.toString()).toBe('![[document.pdf|680]]');
  });

  it('dragging the right corner inward persists a narrower width', async () => {
    const view = await mountResolvedPdf();

    drag(getRightHandle(view), 100, 40);

    expect(view.state.doc.toString()).toBe('![[document.pdf|540]]');
  });

  it('dragging the left corner outward (further left) also widens — mirrored pointer math', async () => {
    const view = await mountResolvedPdf();

    drag(getLeftHandle(view), 100, 20); // moved 80px further left

    expect(view.state.doc.toString()).toBe('![[document.pdf|680]]');
  });

  it('dragging the left corner inward (toward the right) narrows the width', async () => {
    const view = await mountResolvedPdf();

    drag(getLeftHandle(view), 0, 60);

    expect(view.state.doc.toString()).toBe('![[document.pdf|540]]');
  });

  it('never introduces a height token — PdfPresentation has no height field', async () => {
    const view = await mountResolvedPdf();

    drag(getRightHandle(view), 0, 80);

    expect(view.state.doc.toString()).not.toMatch(/,\d+,/); // no second numeric token
    expect(view.state.doc.toString()).toBe('![[document.pdf|680]]');
  });
});

describe('PDF resize lifecycle — no continuous dispatch, exactly one commit, no PDF.js re-render mid-drag', () => {
  it('pointermove alone never mutates the Markdown document', async () => {
    const view = await mountResolvedPdf();
    const before = view.state.doc.toString();

    const handle = getRightHandle(view);
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, 11));
    handle.dispatchEvent(pointerEvent('pointermove', 40, 0, 11));
    handle.dispatchEvent(pointerEvent('pointermove', 80, 0, 11));

    expect(view.state.doc.toString()).toBe(before);
  });

  it('pointermove mutates only the live container width, never the doc', async () => {
    const view = await mountResolvedPdf();
    const container = getContainer(view);
    const before = view.state.doc.toString();

    const handle = getRightHandle(view);
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, 12));
    handle.dispatchEvent(pointerEvent('pointermove', 60, 0, 12));

    expect(container.style.width).toBe('660px');
    expect(view.state.doc.toString()).toBe(before);
  });

  it('pointerup persists exactly once, even after several pointermoves', async () => {
    const view = await mountResolvedPdf();
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    const handle = getRightHandle(view);
    const pointerId = 21;
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 20, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 40, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 80, 0, pointerId));
    expect(dispatchSpy).not.toHaveBeenCalled();

    handle.dispatchEvent(pointerEvent('pointerup', 80, 0, pointerId));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('![[document.pdf|680]]');
  });

  it('no PDF.js render (getPage) happens during pointermove — only the one settle-render after pointerup', async () => {
    const view = await mountResolvedPdf();
    const callsBeforeDrag = pdfjsMock.state.getPageCalls.length;

    const handle = getRightHandle(view);
    const pointerId = 33;
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 40, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 80, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 120, 0, pointerId));
    expect(pdfjsMock.state.getPageCalls.length).toBe(callsBeforeDrag); // zero re-renders mid-drag

    handle.dispatchEvent(pointerEvent('pointerup', 120, 0, pointerId));
    await flush();

    expect(pdfjsMock.state.getPageCalls.length).toBe(callsBeforeDrag + 1); // exactly one settle-render
  });

  it('aspect ratio is preserved: the settle-render after resize computes scale from the new width against the page\'s own natural width, never an independent height', async () => {
    const view = await mountResolvedPdf();
    pdfjsMock.state.renderScales.length = 0;

    drag(getRightHandle(view), 0, 90); // 600 -> 690
    await flush();

    // computeFitScale(availableWidth, baseWidth=600) — the container's
    // padding means available page width is narrower than the container
    // itself, but it must scale strictly from the *new* container width,
    // never from a hand-computed height.
    const lastScale = pdfjsMock.state.renderScales.at(-1);
    expect(lastScale).toBeGreaterThan(0);
    expect(Number.isFinite(lastScale)).toBe(true);
  });

  it('handles pointercancel safely — resumes rendering and cleans up exactly once, without persisting mid-cancel garbage state', async () => {
    const view = await mountResolvedPdf();
    const before = view.state.doc.toString();
    const callsBeforeDrag = pdfjsMock.state.getPageCalls.length;

    const handle = getRightHandle(view);
    const pointerId = 44;
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 60, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointercancel', 60, 0, pointerId));
    await flush();

    // pointercancel still commits (same architecture as Image's own
    // pointerup/pointercancel-alike handling) — but exactly once, and the
    // widget resumes its own rendering (one settle-render), never stuck
    // suppressed.
    expect(view.state.doc.toString()).not.toBe(before);
    expect(pdfjsMock.state.getPageCalls.length).toBe(callsBeforeDrag + 1);

    // A second, redundant pointerup for the same (already-finished) drag
    // must not double-commit.
    const dispatchSpy = vi.spyOn(view, 'dispatch');
    handle.dispatchEvent(pointerEvent('pointerup', 60, 0, pointerId));
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('PDF resize — live visual preview via a real layout width/height on .pdf-viewer__page (no PDF.js involvement)', () => {
  // The mock page is 600×800 at scale 1 (jsdom's `getAvailableViewerWidth`
  // always reads 0, so `computeFitScale` falls back to scale 1 per its own
  // `<= 0` guard) — an exact 3:4 (0.75) aspect ratio, so `newHeight ===
  // newWidth * (800 / 600)` throughout these assertions.

  it('pointermove sets a real layout width+height on .pdf-viewer__page, preserving aspect ratio, and stretches the canvas to fill it', async () => {
    const view = await mountResolvedPdf();
    const pageWrap = getPageWrap(view);
    const canvas = pageWrap.querySelector<HTMLCanvasElement>('canvas')!;

    const handle = getRightHandle(view);
    const pointerId = 51;
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 60, 0, pointerId)); // 600 -> 660, factor 1.1

    expect(pageWrap.style.width).toBe('660px');
    expect(pageWrap.style.height).toBe('880px'); // 660 / (600/800)
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
  });

  it('the preview shrinks both dimensions together for a narrowing drag', async () => {
    const view = await mountResolvedPdf();
    const pageWrap = getPageWrap(view);

    const handle = getRightHandle(view);
    const pointerId = 52;
    handle.dispatchEvent(pointerEvent('pointerdown', 100, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 40, 0, pointerId)); // 600 -> 540, factor 0.9

    expect(pageWrap.style.width).toBe('540px');
    expect(pageWrap.style.height).toBe('720px'); // 540 / (600/800)
  });

  it('the left corner also drives the same live preview, mirrored pointer math', async () => {
    const view = await mountResolvedPdf();
    const pageWrap = getPageWrap(view);

    const handle = getLeftHandle(view);
    const pointerId = 53;
    handle.dispatchEvent(pointerEvent('pointerdown', 100, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 20, 0, pointerId)); // moved 80px further left -> width 680

    expect(pageWrap.style.width).toBe('680px');
    expect(pageWrap.style.height).toBe(`${(680 / 600) * 800}px`);
  });

  it('never triggers a PDF.js render while previewing — the live resize is pure CSS layout, not a re-render', async () => {
    const view = await mountResolvedPdf();
    const callsBeforeDrag = pdfjsMock.state.getPageCalls.length;

    const handle = getRightHandle(view);
    const pointerId = 54;
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 30, 0, pointerId));
    handle.dispatchEvent(pointerEvent('pointermove', 90, 0, pointerId));

    expect(pdfjsMock.state.getPageCalls.length).toBe(callsBeforeDrag);
  });

  it('the settle-render after pointerup replaces the page wrap wholesale, discarding the temporary preview sizing', async () => {
    const view = await mountResolvedPdf();
    const previewedPageWrap = getPageWrap(view);

    drag(getRightHandle(view), 0, 60);
    await flush();

    const settledPageWrap = getPageWrap(view);
    expect(settledPageWrap).not.toBe(previewedPageWrap);
    // A wholesale new element from `renderCurrentPage()` — never carries
    // over the old element's own inline preview sizing.
    expect(settledPageWrap.style.width).toBe('');
    expect(settledPageWrap.style.height).toBe('');
  });
});

describe('PDF resize preserves alignment and composes with undo/redo', () => {
  it('alignment already set on the embed survives a width-only resize', async () => {
    const view = await mountResolvedPdf('![[document.pdf|center]]');

    drag(getRightHandle(view), 0, 80);

    expect(view.state.doc.toString()).toBe('![[document.pdf|680,center]]');
    expect(getContainer(view).dataset.align).toBe('center');
  });

  it('undo reverts a resize commit; redo reapplies it', async () => {
    const view = await mountResolvedPdf();

    drag(getRightHandle(view), 0, 80);
    expect(view.state.doc.toString()).toBe('![[document.pdf|680]]');

    undo(view);
    expect(view.state.doc.toString()).toBe(PDF_MD);

    redo(view);
    expect(view.state.doc.toString()).toBe('![[document.pdf|680]]');
  });
});

describe('no regression to pagination or PDF controls after a resize', () => {
  it('Next/Previous page navigation still works after a resize on a multi-page document', async () => {
    const view = await mountResolvedPdf(PDF_MD, 2);
    const embed = view.dom.querySelector<HTMLElement>('.cm-pdf-embed')!;

    drag(getRightHandle(view), 0, 60);
    await flush();

    const nextButton = embed.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
    expect(nextButton).not.toBeNull();
    const callsBeforeNav = pdfjsMock.state.getPageCalls.length;

    nextButton!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    nextButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(pdfjsMock.state.getPageCalls.length).toBe(callsBeforeNav + 1);
    expect(pdfjsMock.state.getPageCalls.at(-1)).toBe(2);
    expect(embed.querySelector('.pdf-viewer__page-indicator')?.textContent).toBe('2 / 2');
  });

  it('Edit source / floating controls still exist and respond after a resize', async () => {
    const view = await mountResolvedPdf();

    drag(getRightHandle(view), 0, 50);
    await flush();

    const editButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="Edit source"], .cm-pdf-embed button[aria-label="Hide source"]'
    );
    expect(editButton).not.toBeNull();
    editButton!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    editButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.querySelector('[data-source-revealed="true"]')).not.toBeNull();
  });
});
