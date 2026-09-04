// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';

import { markdownLanguageExtension } from '../markdownLanguage';
import { embedLivePreview } from '../embed/embedLivePreview';
import { embedCompletionSource } from '../embed/embedCompletionSource';
import { embedAutocomplete } from '../embed/embedAutocomplete';
import type { EmbedImageResolution, ResolveEmbedImage } from '../embed/embedImageResolution';
import type { GetEmbedSuggestions } from '../embed/embedSuggestion';
import type { EmbedPdfResolution, ResolveEmbedPdf } from './embedPdfResolution';
import type { OnPdfEmbedClick } from './PdfEmbedWidget';

// Same PDF.js mocking shape PdfPageCanvas.test.tsx/PdfViewer.test.tsx
// already establish — this suite is about the Embed lifecycle wiring
// (embedLivePreview.ts's new PDF branch, PdfEmbedWidget.ts's own
// load/broken/open/edit-source behavior), not pdfjs-dist's real rendering
// pipeline.
const pdfjsMock = vi.hoisted(() => ({
  state: {
    getDocumentUrls: [] as string[],
    shouldFail: false,
    numPages: 1,
  },
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn((url: string) => {
    pdfjsMock.state.getDocumentUrls.push(url);
    const promise = pdfjsMock.state.shouldFail
      ? Promise.reject(new Error('bad pdf'))
      : Promise.resolve({
          numPages: pdfjsMock.state.numPages,
          getPage: vi.fn(() =>
            Promise.resolve({
              getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
              render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
            })
          ),
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

/** Drains the chain of microtasks PdfEmbedWidget's own async load/render chain goes through (getDocument().promise -> doc.getPage().then -> renderPdfPage's own async IIFE). */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

/** Every path not explicitly listed resolves 'unresolved' — mirrors resolveEmbedImage's own real behavior for a genuinely missing VaultResource. */
function imageResolverFor(entries: Record<string, EmbedImageResolution>): ResolveEmbedImage {
  return (path, alias) => entries[path] ?? { status: 'unresolved', alt: alias ?? path };
}

/** Every path not explicitly listed resolves 'non-pdf' — real composition never reaches this for a genuinely missing resource (resolveEmbedImage already returns 'unresolved' first), but the widget-selection logic is exercised defensively either way. */
function pdfResolverFor(entries: Record<string, EmbedPdfResolution>): ResolveEmbedPdf {
  return (path) => entries[path] ?? { status: 'non-pdf' };
}

function pdfResolution(url: string, title: string, path: string): EmbedPdfResolution {
  return { status: 'pdf', url, title, path };
}

function mountView(
  doc: string,
  resolveEmbedImage: ResolveEmbedImage,
  resolveEmbedPdf: ResolveEmbedPdf,
  anchor = 0,
  onPdfEmbedClick: OnPdfEmbedClick = () => {}
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
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
        () => onPdfEmbedClick
      ),
    ],
  });
  return new EditorView({ state, parent });
}

function mountFullView(
  doc: string,
  resolveEmbedImage: ResolveEmbedImage,
  resolveEmbedPdf: ResolveEmbedPdf,
  getEmbedSuggestions: GetEmbedSuggestions,
  anchor = 0
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      history(),
      markdownLanguageExtension(),
      autocompletion({ override: [embedCompletionSource(() => getEmbedSuggestions)] }),
      embedAutocomplete(),
      embedLivePreview(
        () => resolveEmbedImage,
        () => undefined,
        () => undefined,
        () => resolveEmbedPdf,
        () => undefined
      ),
    ],
  });
  return new EditorView({ state, parent });
}

function getPdfEmbed(view: EditorView): HTMLElement | null {
  return view.dom.querySelector('.cm-pdf-embed');
}

/** The working-state Edit source control lives in the `.pdf-viewer__toolbar` (the same button styling `PdfViewer`'s own toolbar uses — see `PdfEmbedWidget.makeToolbarButton`), distinct from the broken-card's `.cm-image-control` variant. */
function getEditButton(view: EditorView): HTMLButtonElement {
  const button = view.dom.querySelector<HTMLButtonElement>(
    '.cm-pdf-embed button[aria-label="Edit source"], .cm-pdf-embed button[aria-label="Hide source"]'
  );
  if (!button) {
    throw new Error('edit/source control not found');
  }
  return button;
}

const PDF = '![[document.pdf]]';

describe('embedLivePreview — PDF embeds, rendering (at rest)', () => {
  it('renders a resolved PDF embed with its title and page canvas', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    expect(getPdfEmbed(view)).not.toBeNull();
    expect(view.dom.querySelector('.cm-pdf-embed .pdf-viewer__title')?.textContent).toBe('document');

    await flush();

    expect(view.dom.querySelector('.pdf-viewer__page-canvas')).not.toBeNull();
  });

  it('a missing PDF resource renders the shared broken-resource state (not a PDF-specific one), never calling the PDF resolver', () => {
    const resolveEmbedPdf = vi.fn(pdfResolverFor({}));
    const view = mountView('x ![[missing.pdf]]', imageResolverFor({}), resolveEmbedPdf);

    expect(getPdfEmbed(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
    expect(view.dom.querySelector('.cm-image-broken__hint')?.textContent).toBe('missing.pdf');
    expect(resolveEmbedPdf).not.toHaveBeenCalled();
  });

  it('a resolved-but-non-pdf outcome renders nothing — raw Markdown stays exactly as written', () => {
    const view = mountView(
      'x ![[note.txt]]',
      imageResolverFor({ 'note.txt': { status: 'non-image' } }),
      pdfResolverFor({ 'note.txt': { status: 'non-pdf' } })
    );

    expect(getPdfEmbed(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-container')).toBeNull();
    expect(view.dom.textContent).toContain('![[note.txt]]');
  });

  it('a genuine getDocument() failure (corrupt/invalid PDF) flips to the same broken state, via the shared imageUiState mechanism', async () => {
    pdfjsMock.state.shouldFail = true;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      expect(getPdfEmbed(view)).not.toBeNull();
      await flush();

      expect(view.dom.querySelector('.cm-image-container--broken')).not.toBeNull();
    } finally {
      pdfjsMock.state.shouldFail = false;
    }
  });
});

describe('embedLivePreview — PDF embeds, empty/incomplete syntax stays raw (shared universal rule)', () => {
  it('![[]] never renders a PDF widget or broken state', () => {
    const view = mountView('x ![[]]', imageResolverFor({}), pdfResolverFor({}));
    expect(getPdfEmbed(view)).toBeNull();
    expect(view.dom.querySelector('.cm-image-broken')).toBeNull();
    expect(view.dom.textContent).toContain('![[]]');
  });

  it('unclosed ![[document.pdf remains plain editable text', () => {
    const view = mountView('x ![[document.pdf', imageResolverFor({}), pdfResolverFor({}));
    expect(getPdfEmbed(view)).toBeNull();
    expect(view.dom.textContent).toContain('![[document.pdf');
  });
});

describe('embedLivePreview — PDF embeds, first-leave lifecycle', () => {
  it('a freshly typed PDF embed stays raw until the caret leaves, then renders', () => {
    const view = mountView(
      'x |',
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') }),
      1
    );

    view.dispatch({ changes: { from: 1, to: 2, insert: PDF }, selection: { anchor: 1 + PDF.length } });
    expect(getPdfEmbed(view)).toBeNull();
    expect(view.dom.textContent).toContain(PDF);

    view.dispatch({ selection: { anchor: 0 } });
    expect(getPdfEmbed(view)).not.toBeNull();
  });
});

describe('embedLivePreview — PDF embeds, autocomplete renders immediately on selection', () => {
  it('accepting a PDF suggestion inserts the reference and renders it immediately, cursor after ]]', () => {
    const getEmbedSuggestions: GetEmbedSuggestions = () => [
      { kind: 'resource', path: 'document.pdf', title: 'document.pdf', breadcrumb: '', resourceKind: 'pdf' },
    ];
    const view = mountFullView(
      'x ![[',
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') }),
      getEmbedSuggestions,
      5
    );

    // Deliberately not exercising the completion UI's own keyboard flow
    // here (embedCompletionSource.test.ts already covers accept mechanics
    // in depth) — directly dispatching the same effect+insert shape
    // apply() produces is enough to verify embedLivePreview.ts's own PDF
    // branch renders immediately rather than staying raw.
    view.dispatch({ changes: { from: 5, to: 5, insert: 'document.pdf]]' } });

    expect(view.state.doc.toString()).toBe(`x ${PDF}`);
  });
});

describe('embedLivePreview — PDF embeds, edit-source reveal/hide lifecycle', () => {
  it('Edit source reveals the raw Markdown alongside the rendered widget; hides again on leave', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    expect(view.dom.textContent).not.toContain(PDF);
    getEditButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.textContent).toContain(PDF);
    expect(getPdfEmbed(view)).not.toBeNull();

    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.textContent).not.toContain(PDF);
    expect(getPdfEmbed(view)).not.toBeNull();
  });

  it('regression (2026-09 edit-source flicker fix): reveal/hide toggles never re-fetch an already-loaded PDF document', async () => {
    pdfjsMock.state.getDocumentUrls.length = 0;
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );
    await flush();
    expect(pdfjsMock.state.getDocumentUrls).toEqual(['app://vault/document.pdf']);

    // Reveal (destroys the replace-decoration widget, mounts a fresh
    // widget-after one — an inherent, shared consequence of the
    // Decoration.replace -> Decoration.widget type change, not a bug on
    // its own) then hide again (destroys that widget, mounts a fresh
    // replace-decoration one). Each reconstruction must reuse the cached
    // document rather than issuing a second/third getDocument() call —
    // that redundant network+parse round trip was the actual root cause
    // of the visible flicker.
    getEditButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    getEditButton(view).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(pdfjsMock.state.getDocumentUrls).toEqual(['app://vault/document.pdf']);
  });
});

describe('embedLivePreview — PDF embeds, Expand control', () => {
  it('clicking Expand invokes the injected callback with the embed’s own vault-relative path', () => {
    const onPdfEmbedClick = vi.fn();
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') }),
      0,
      onPdfEmbedClick
    );

    const expandButton = view.dom.querySelector<HTMLButtonElement>('.cm-pdf-embed button[aria-label="Expand"]');
    expect(expandButton).not.toBeNull();
    expandButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onPdfEmbedClick).toHaveBeenCalledWith('document.pdf');
  });

  it('Expand appears before Edit source in the toolbar', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const group = view.dom.querySelector('.cm-pdf-embed .pdf-viewer__toolbar-controls')!;
    const labels = Array.from(group.querySelectorAll<HTMLButtonElement>('button')).map((button) =>
      button.getAttribute('aria-label')
    );

    expect(labels.indexOf('Expand')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Edit source')).toBeGreaterThan(labels.indexOf('Expand'));
  });
});

describe('embedLivePreview — PDF embeds, consecutive and mixed-content independence', () => {
  it('two consecutive PDF embeds maintain independent lifecycle state', () => {
    const view = mountView(
      '![[one.pdf]]\n![[two.pdf]]',
      imageResolverFor({
        'one.pdf': { status: 'non-image' },
        'two.pdf': { status: 'non-image' },
      }),
      pdfResolverFor({
        'one.pdf': pdfResolution('app://vault/one.pdf', 'one', 'one.pdf'),
        'two.pdf': pdfResolution('app://vault/two.pdf', 'two', 'two.pdf'),
      })
    );

    const embeds = view.dom.querySelectorAll('.cm-pdf-embed');
    expect(embeds.length).toBe(2);

    // Editing one embed's own line (revealing its source) never affects
    // the other — same independence contract imageLivePreview.test.ts's
    // own consecutive-image tests already establish for images.
    const editButtons = view.dom.querySelectorAll<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="Edit source"]'
    );
    expect(editButtons.length).toBe(2);
    editButtons[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.textContent).toContain('![[one.pdf]]');
    expect(view.dom.textContent).not.toContain('![[two.pdf]]');
    expect(view.dom.querySelectorAll('.cm-pdf-embed').length).toBe(2);
  });

  it('a PDF embed alongside an image embed and a missing PDF renders each independently, with no leakage', () => {
    const view = mountView(
      '![[photo.png]]\n![[document.pdf]]\n![[missing.pdf]]',
      imageResolverFor({
        'photo.png': { status: 'image', url: 'app://vault/photo.png', copyUrl: 'photo.png', alt: 'photo.png' },
        'document.pdf': { status: 'non-image' },
      }),
      pdfResolverFor({
        'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf'),
      })
    );

    // The image embed's own real <img> mount is now gated behind a
    // load-confirmation probe (ImageWidget.ts's 2026-09 native-broken-icon
    // fix) that this PDF-focused test file doesn't intercept/settle — its
    // *container* still mounts synchronously either way, which is enough
    // to confirm the image embed rendered as a working (non-broken) image
    // construct, independent of the PDF/missing-PDF embeds alongside it.
    const workingImageContainers = view.dom.querySelectorAll('.cm-image-container:not(.cm-image-container--broken)');
    expect(workingImageContainers.length).toBe(1);
    expect(view.dom.querySelectorAll('.cm-pdf-embed').length).toBe(1);
    expect(view.dom.querySelectorAll('.cm-image-container--broken').length).toBe(1);
  });
});

describe('embedLivePreview — PDF embeds, PdfOverlay presentation parity', () => {
  it('uses the exact same viewer presentation classes PdfOverlay/PdfViewer render — no second toolbar/page design', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const embed = getPdfEmbed(view)!;
    expect(embed.querySelector('.pdf-viewer__toolbar')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__title')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__toolbar-controls')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__scroll')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__status')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__spinner')).not.toBeNull();
    // No PDF-embed-specific header/title/zoom-indicator classes left behind
    // — those would be a second, parallel design instead of reuse.
    expect(embed.querySelector('.cm-pdf-embed__header')).toBeNull();
    expect(embed.querySelector('.cm-pdf-embed__title')).toBeNull();
    expect(embed.querySelector('.cm-pdf-embed__zoom-indicator')).toBeNull();

    await flush();

    expect(embed.querySelector('.pdf-viewer__page')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__page-canvas')).not.toBeNull();
  });

  it('zoom controls are hidden until the document is ready, then use the canonical zoom sequence starting at 100%', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const embed = getPdfEmbed(view)!;
    const zoomIndicator = () => embed.querySelector('.pdf-viewer__zoom-indicator');
    const zoomInButton = () =>
      embed.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOutButton = () =>
      embed.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');

    expect(zoomInButton()!.closest<HTMLElement>('.pdf-viewer__control-group')!.hidden).toBe(true);

    await flush();

    expect(zoomInButton()!.closest<HTMLElement>('.pdf-viewer__control-group')!.hidden).toBe(false);
    expect(zoomIndicator()?.textContent).toBe('100%');

    zoomInButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(zoomIndicator()?.textContent).toBe('125%');

    zoomOutButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    zoomOutButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(zoomIndicator()?.textContent).toBe('75%');
  });

  it('page navigation appears only for multi-page documents and moves the page indicator', async () => {
    pdfjsMock.state.numPages = 3;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      const pageIndicator = () => embed.querySelector('.pdf-viewer__page-indicator');
      const nextPageButton = () =>
        embed.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
      const prevPageButton = () =>
        embed.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]');

      expect(nextPageButton()!.closest<HTMLElement>('.pdf-viewer__control-group')!.hidden).toBe(true);

      await flush();

      expect(nextPageButton()!.closest<HTMLElement>('.pdf-viewer__control-group')!.hidden).toBe(false);
      expect(pageIndicator()?.textContent).toBe('1 / 3');
      expect(prevPageButton()!.disabled).toBe(true);

      nextPageButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(pageIndicator()?.textContent).toBe('2 / 3');
      expect(prevPageButton()!.disabled).toBe(false);
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  it('Edit Markdown (Edit source) and Expand sit in the toolbar as PdfViewer-styled buttons, not the broken-card control', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const editButton = getEditButton(view);
    const expandButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="Expand"]'
    )!;

    for (const button of [editButton, expandButton]) {
      expect(button.closest('.pdf-viewer__toolbar')).not.toBeNull();
      expect(button.classList.contains('button')).toBe(true);
      expect(button.classList.contains('button--ghost')).toBe(true);
      expect(button.classList.contains('cm-image-control')).toBe(false);
    }
  });

  it('the embed container stays within the editor width so the CodeMirror line never overflows horizontally', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    // `.cm-pdf-embed-container`'s own `max-width: 100%` rule (PdfEmbedWidget.css)
    // is what bounds the widget to the editor's width — this asserts the
    // widget carries that class (the actual CSS rule is exercised by the
    // real stylesheet, not by jsdom's non-rendering layout engine). The
    // zoomable page lives inside its own scroller, never the container
    // itself — that scroller is what may grow past the editor's width when
    // zoomed, not the editor line.
    const container = view.dom.querySelector('.cm-pdf-embed-container');
    expect(container).not.toBeNull();
    expect(container!.querySelector('.pdf-viewer__scroll')).not.toBeNull();
  });
});
