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
import type { OnOpenPdfMenu, OnPdfEmbedClick } from './PdfEmbedWidget';

// Same PDF.js mocking shape PdfPageCanvas.test.tsx/PdfViewer.test.tsx
// already establish — this suite is about the Embed lifecycle wiring
// (embedLivePreview.ts's PDF branch, PdfEmbedWidget.ts's own
// load/broken/pagination/open/edit-source behavior), not pdfjs-dist's real
// rendering pipeline. Every page reports the same 600×800 base size at
// scale 1 — the mock doesn't model per-page size variation, which is fine
// here (that's a pdfjs-dist behavior, not something this widget computes).
const pdfjsMock = vi.hoisted(() => ({
  state: {
    getDocumentUrls: [] as string[],
    getPageCalls: [] as number[],
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
          getPage: vi.fn((pageNumber: number) => {
            pdfjsMock.state.getPageCalls.push(pageNumber);
            return Promise.resolve({
              getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
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

// A controllable ResizeObserver mock — jsdom has no real layout engine, so
// `clientWidth` never reflects an actual box size; `trigger()` lets a test
// simulate the browser calling this observer's callback after a real
// resize, once the test has stubbed the target's own `clientWidth` (see
// `stubAvailableWidth` below). Same shape PdfViewer.test.tsx's own
// "Fit-Width" suite already establishes.
class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

/** Stubs the embed's own `.cm-pdf-embed-page` element's `clientWidth` (jsdom never sets this from real layout) and fires the ResizeObserver callback so PdfEmbedWidget's own fit-scale logic recomputes against it. */
function stubAvailableWidth(embed: HTMLElement, clientWidth: number): void {
  const pageHost = embed.querySelector<HTMLElement>('.cm-pdf-embed-page');
  if (!pageHost) {
    throw new Error('expected a .cm-pdf-embed-page element');
  }
  Object.defineProperty(pageHost, 'clientWidth', { value: clientWidth, configurable: true });
  ResizeObserverMock.instances.at(-1)!.trigger();
}

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

function pdfResolution(url: string, title: string, path: string, resourceId = `resource-${path}`): EmbedPdfResolution {
  return { status: 'pdf', url, title, path, resourceId };
}

function mountView(
  doc: string,
  resolveEmbedImage: ResolveEmbedImage,
  resolveEmbedPdf: ResolveEmbedPdf,
  anchor = 0,
  onPdfEmbedClick: OnPdfEmbedClick = () => {},
  onOpenPdfMenu: OnOpenPdfMenu = () => {}
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
        () => onPdfEmbedClick,
        () => onOpenPdfMenu
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
        () => undefined,
        () => undefined
      ),
    ],
  });
  return new EditorView({ state, parent });
}

function getPdfEmbed(view: EditorView): HTMLElement | null {
  return view.dom.querySelector('.cm-pdf-embed');
}

/** The working-state Edit source control is one of the floating controls (`.cm-image-controls`/`.cm-image-control` — the exact same floating-control system `ImageWidget.ts`'s own controls use), distinct from the broken-card's `.cm-image-control` variant only in which container it sits inside. */
function getEditButton(view: EditorView): HTMLButtonElement {
  const button = view.dom.querySelector<HTMLButtonElement>(
    '.cm-pdf-embed button[aria-label="Edit source"], .cm-pdf-embed button[aria-label="Hide source"]'
  );
  if (!button) {
    throw new Error('edit/source control not found');
  }
  return button;
}

function getPrevButton(embed: HTMLElement): HTMLButtonElement | null {
  return embed.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]');
}

function getNextButton(embed: HTMLElement): HTMLButtonElement | null {
  return embed.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
}

function getPageIndicator(embed: HTMLElement): Element | null {
  return embed.querySelector('.pdf-viewer__page-indicator');
}

/** Previous/Next use `aria-disabled` (`PdfEmbedWidget.setButtonDisabled`), deliberately never the native `disabled` property/attribute — see that method's own doc comment for why (native `disabled` form controls are excluded from normal mouse hit-testing, which was the actual root cause of the two buttons' asymmetric hover-reveal behavior). */
function isAriaDisabled(button: HTMLButtonElement): boolean {
  return button.getAttribute('aria-disabled') === 'true';
}

const PDF = '![[document.pdf]]';

describe('embedLivePreview — PDF embeds, rendering (at rest)', () => {
  it('renders a resolved PDF embed as a single-page preview — title shown, page canvas rendered', async () => {
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

  it('Expand opens the existing PdfOverlay (via the injected callback) — never a second PDF reader/overlay of its own', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    // No overlay-shaped markup exists anywhere in this widget's own DOM —
    // Expand's only job is invoking the injected callback (asserted above);
    // the actual PdfOverlay mount lives entirely at the app layer.
    const embed = getPdfEmbed(view)!;
    expect(embed.querySelector('.pdf-overlay')).toBeNull();
    expect(embed.querySelector('.overlay')).toBeNull();
  });
});

describe('embedLivePreview — PDF embeds, More actions control', () => {
  it('clicking More actions invokes the injected callback with this button as the anchor and the embed’s already-resolved resourceId', () => {
    const onOpenPdfMenu = vi.fn();
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({
        'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf', 'resource-1'),
      }),
      0,
      () => {},
      onOpenPdfMenu
    );

    const moreActionsButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="More actions"]'
    );
    expect(moreActionsButton).not.toBeNull();
    moreActionsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenPdfMenu).toHaveBeenCalledWith({ anchor: moreActionsButton, resourceId: 'resource-1' });
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

describe('embedLivePreview — PDF embeds, single-page preview presentation (not a miniature reader, not a vertical stack)', () => {
  it('renders exactly one page — no reader chrome, no vertical multi-page stack, no scroll region', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const embed = getPdfEmbed(view)!;
    // Per-page rendering primitives — and the title's own text styling —
    // are reused verbatim (PdfViewer.css).
    expect(embed.querySelector('.pdf-viewer__status')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__spinner')).not.toBeNull();
    expect(embed.querySelector('.pdf-viewer__title')).not.toBeNull();
    // No reader-chrome *layout* classes, no scroll container — this is a
    // page preview + pagination, not a miniature reader and not a
    // vertical stack.
    expect(embed.querySelector('.pdf-viewer__toolbar')).toBeNull();
    expect(embed.querySelector('.pdf-viewer__toolbar-controls')).toBeNull();
    expect(embed.querySelector('.pdf-viewer__scroll')).toBeNull();
    expect(embed.querySelector('.cm-pdf-embed-pages')).toBeNull();

    await flush();

    expect(embed.querySelectorAll('.pdf-viewer__page')).toHaveLength(1);
    expect(embed.querySelector('.pdf-viewer__page-canvas')).not.toBeNull();
  });

  it('has no inline zoom controls and no zoom percentage anywhere', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const embed = getPdfEmbed(view)!;
    await flush();

    expect(embed.querySelector('button[aria-label="Zoom in"]')).toBeNull();
    expect(embed.querySelector('button[aria-label="Zoom out"]')).toBeNull();
    expect(embed.querySelector('.pdf-viewer__zoom-indicator')).toBeNull();
    expect(embed.textContent).not.toMatch(/\d+%/);
  });

  it('page navigation is hidden entirely for a single-page document — matching PdfViewer’s own convention', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const embed = getPdfEmbed(view)!;
    await flush();

    const pagination = getPrevButton(embed)!.closest<HTMLElement>('.cm-pdf-embed-pagination')!;
    expect(pagination.hidden).toBe(true);
  });

  it('page navigation is its own dedicated `.cm-pdf-embed-pagination` control — not the shared `.cm-image-controls` chrome the top-row actions use', async () => {
    pdfjsMock.state.numPages = 4;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();

      const pagination = embed.querySelector<HTMLElement>('.cm-pdf-embed-pagination')!;
      expect(pagination).not.toBeNull();
      expect(getPrevButton(embed)!.closest('.cm-pdf-embed-pagination')).toBe(pagination);
      expect(getNextButton(embed)!.closest('.cm-pdf-embed-pagination')).toBe(pagination);
      expect(getPageIndicator(embed)!.closest('.cm-pdf-embed-pagination')).toBe(pagination);
      // Not nested inside the top row's shared action-button chrome.
      expect(pagination.closest('.cm-image-controls')).toBeNull();
      expect(pagination.querySelector('.cm-image-controls')).toBeNull();
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  it('the page indicator stays visible unconditionally — only the arrow buttons carry the hover-reveal `.cm-image-control` class', async () => {
    pdfjsMock.state.numPages = 4;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();

      expect(getPageIndicator(embed)!.classList.contains('cm-image-control')).toBe(false);
      expect(getPrevButton(embed)!.classList.contains('cm-image-control')).toBe(true);
      expect(getNextButton(embed)!.classList.contains('cm-image-control')).toBe(true);
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  it('More actions, Expand, and Edit source are floating `.cm-image-control` buttons — the exact same visual system ImageWidget’s own controls use, not a PdfViewer-toolbar button', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const editButton = getEditButton(view);
    const expandButton = view.dom.querySelector<HTMLButtonElement>('.cm-pdf-embed button[aria-label="Expand"]')!;
    const moreActionsButton = view.dom.querySelector<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="More actions"]'
    )!;

    for (const button of [editButton, expandButton, moreActionsButton]) {
      expect(button.closest('.cm-image-controls')).not.toBeNull();
      expect(button.classList.contains('cm-image-control')).toBe(true);
      expect(button.closest('.pdf-viewer__toolbar')).toBeNull();
    }
  });

  it('the embed container stays within the editor width so the CodeMirror line never overflows horizontally', () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    // `.cm-pdf-embed-container`'s own `max-width: 100%` rule
    // (PdfEmbedWidget.css) is what bounds the widget to the editor's width
    // — this asserts the widget carries that class (the actual CSS rule is
    // exercised by the real stylesheet, not by jsdom's non-rendering layout
    // engine). The current page lives inside its own host
    // (`.cm-pdf-embed-page`), never the container itself.
    const container = view.dom.querySelector('.cm-pdf-embed-container');
    expect(container).not.toBeNull();
    expect(container!.querySelector('.cm-pdf-embed-page')).not.toBeNull();
  });
});

describe('embedLivePreview — PDF embeds, pagination', () => {
  it('opens on page 1 with a "1 / N" indicator, entire page visible (no scroll region)', async () => {
    pdfjsMock.state.numPages = 4;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();

      expect(getPageIndicator(embed)?.textContent).toBe('1 / 4');
      expect(isAriaDisabled(getPrevButton(embed)!)).toBe(true);
      expect(isAriaDisabled(getNextButton(embed)!)).toBe(false);
      expect(embed.querySelectorAll('.pdf-viewer__page')).toHaveLength(1);
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  it('Next/Previous move exactly one page at a time, replacing the rendered page in place — never rendering more than one page at once', async () => {
    pdfjsMock.state.numPages = 4;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('1 / 4');

      getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('2 / 4');
      expect(embed.querySelectorAll('.pdf-viewer__page')).toHaveLength(1);
      expect(isAriaDisabled(getPrevButton(embed)!)).toBe(false);

      getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('3 / 4');

      getPrevButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('2 / 4');
      expect(embed.querySelectorAll('.pdf-viewer__page')).toHaveLength(1);
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  it('Next is disabled on the final page and further clicks are no-ops (no wrapping)', async () => {
    pdfjsMock.state.numPages = 3;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();

      getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('3 / 3');
      expect(isAriaDisabled(getNextButton(embed)!)).toBe(true);

      getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('3 / 3');
      expect(pdfjsMock.state.getPageCalls).not.toContain(4);
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  it('Previous is disabled on the first page and further clicks are no-ops (no wrapping)', async () => {
    pdfjsMock.state.numPages = 3;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();
      expect(isAriaDisabled(getPrevButton(embed)!)).toBe(true);

      getPrevButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('1 / 3');
      expect(pdfjsMock.state.getPageCalls).not.toContain(0);
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });

  describe('regression: Previous/Next receive identical floating-control treatment, independent of enabled/disabled state', () => {
    /**
     * Root cause of the reported bug: `updateChrome()` used to toggle the
     * native `disabled` property on these buttons — and a native
     * `disabled` form control is excluded from normal browser mouse
     * hit-testing, which broke hover-reveal tracking asymmetrically
     * (exactly one of the two is ever disabled at a time). The fix
     * (`PdfEmbedWidget.setButtonDisabled`) switched to `aria-disabled`,
     * which keeps the button fully mouse-interactive. These tests lock in
     * the DOM contract that makes that fix verifiable: neither button
     * should ever carry the native `disabled` attribute, both should
     * always carry the exact same classes/wrapper regardless of which one
     * is currently (visually/functionally) disabled, and the enabled one
     * of the pair never regresses back to native `disabled` either.
     */
    it('neither Previous nor Next ever carries the native `disabled` attribute, at any page', async () => {
      pdfjsMock.state.numPages = 3;
      try {
        const view = mountView(
          `x ${PDF}`,
          imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
          pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
        );

        const embed = getPdfEmbed(view)!;
        await flush();

        // Page 1 — Previous is (visually/functionally) disabled...
        expect(isAriaDisabled(getPrevButton(embed)!)).toBe(true);
        // ...but never via the native attribute, on EITHER button.
        expect(getPrevButton(embed)!.hasAttribute('disabled')).toBe(false);
        expect(getNextButton(embed)!.hasAttribute('disabled')).toBe(false);

        getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
        // Page 2 — neither is disabled, native attribute still absent from both.
        expect(isAriaDisabled(getPrevButton(embed)!)).toBe(false);
        expect(isAriaDisabled(getNextButton(embed)!)).toBe(false);
        expect(getPrevButton(embed)!.hasAttribute('disabled')).toBe(false);
        expect(getNextButton(embed)!.hasAttribute('disabled')).toBe(false);

        getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
        // Page 3 (last) — Next is disabled, still never via the native attribute.
        expect(isAriaDisabled(getNextButton(embed)!)).toBe(true);
        expect(getPrevButton(embed)!.hasAttribute('disabled')).toBe(false);
        expect(getNextButton(embed)!.hasAttribute('disabled')).toBe(false);
      } finally {
        pdfjsMock.state.numPages = 1;
      }
    });

    it('both buttons always share the exact same wrapper/class structure — no per-button DOM divergence at any page', async () => {
      pdfjsMock.state.numPages = 3;
      try {
        const view = mountView(
          `x ${PDF}`,
          imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
          pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
        );

        const embed = getPdfEmbed(view)!;
        await flush();
        const paginationEl = embed.querySelector<HTMLElement>('.cm-pdf-embed-pagination')!;

        for (const clicks of [0, 1, 2]) {
          for (let i = 0; i < clicks; i++) {
            getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
          }
          const prev = getPrevButton(embed)!;
          const next = getNextButton(embed)!;
          expect(prev.closest('.cm-pdf-embed-pagination')).toBe(paginationEl);
          expect(next.closest('.cm-pdf-embed-pagination')).toBe(paginationEl);
          expect(prev.classList.contains('cm-image-control')).toBe(true);
          expect(next.classList.contains('cm-image-control')).toBe(true);
        }
      } finally {
        pdfjsMock.state.numPages = 1;
      }
    });

    it('the enabled button in the pair is never left aria-disabled — page 1 (Next enabled) and the last page (Previous enabled)', async () => {
      pdfjsMock.state.numPages = 3;
      try {
        const view = mountView(
          `x ${PDF}`,
          imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
          pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
        );

        const embed = getPdfEmbed(view)!;
        await flush();
        expect(isAriaDisabled(getNextButton(embed)!)).toBe(false);

        getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
        getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
        expect(getPageIndicator(embed)?.textContent).toBe('3 / 3');
        expect(isAriaDisabled(getPrevButton(embed)!)).toBe(false);
      } finally {
        pdfjsMock.state.numPages = 1;
      }
    });
  });
});

describe('embedLivePreview — PDF embeds, Fit-Width', () => {
  it('computes the PDF.js viewport scale from the embed’s own available width — the canvas width matches it, preserving aspect ratio', async () => {
    const view = mountView(
      `x ${PDF}`,
      imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
      pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
    );

    const embed = getPdfEmbed(view)!;
    // The fake page's own base width at scale 1 is 600 — 822 / 600 = 1.37,
    // deliberately not a round number, to confirm the scale is genuinely
    // computed from the available width rather than hardcoded.
    stubAvailableWidth(embed, 822);
    await flush();

    const canvas = embed.querySelector<HTMLCanvasElement>('.pdf-viewer__page-canvas')!;
    expect(canvas.style.width).toBe('822px');
    // Height follows the same scale, preserving the mock's 600:800 (3:4)
    // aspect ratio — 822 * (800 / 600) = 1096.
    expect(canvas.style.height).toBe('1096px');
  });

  it('resize recalculates the fit scale for the current page — without changing which page is shown', async () => {
    pdfjsMock.state.numPages = 3;
    try {
      const view = mountView(
        `x ${PDF}`,
        imageResolverFor({ 'document.pdf': { status: 'non-image' } }),
        pdfResolverFor({ 'document.pdf': pdfResolution('app://vault/document.pdf', 'document', 'document.pdf') })
      );

      const embed = getPdfEmbed(view)!;
      await flush();

      getNextButton(embed)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(getPageIndicator(embed)?.textContent).toBe('2 / 3');

      stubAvailableWidth(embed, 900);
      await flush();

      // Still page 2 — a resize must never change the current page.
      expect(getPageIndicator(embed)?.textContent).toBe('2 / 3');
      const canvas = embed.querySelector<HTMLCanvasElement>('.pdf-viewer__page-canvas')!;
      expect(canvas.style.width).toBe('900px');
    } finally {
      pdfjsMock.state.numPages = 1;
    }
  });
});
