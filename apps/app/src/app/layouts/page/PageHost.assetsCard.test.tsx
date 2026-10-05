// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { Page } from '@core/vault/models/Page';

/**
 * End-to-end regression coverage for the Expand → PdfOverlay wiring bug:
 * the inline embed's own unit tests (embedLivePreview.pdf.test.ts) mount
 * only the CodeMirror widget in isolation and confirm the injected
 * `onPdfEmbedClick` callback is *called* — that passed even while the real
 * app showed no overlay, because the break was one layer up, in how
 * PageHost's own `resourceOverlay` state and `<PdfOverlay>` render were
 * wired together (see PageHost.tsx's own `openResourceOverlay`/
 * `resourceOverlay` state and the two `<PdfOverlay resource={...}>` call
 * sites). This suite renders the real `PageHost` composition — the same
 * one Sidebar.test.tsx's "opening a local resource pdf" suite already
 * exercises for the Sidebar entry point — so a break anywhere in the full
 * chain (PdfEmbedWidget → MarkdownEditor → PageHost → resourceOverlay →
 * PdfOverlay) fails a test, not just the widget's own callback-was-invoked
 * check.
 */

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  convertFileSrc: (path: string) => `app://${path}`,
}));

// Same PDF.js mocking shape embedLivePreview.pdf.test.ts/PdfViewer.test.tsx
// already establish — this suite is about the Expand→PdfOverlay wiring,
// not pdf.js's real rendering pipeline.
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

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// PdfPageCanvas.tsx observes page visibility for its current-page-indicator
// via a real IntersectionObserver — same stub shape PdfViewer.test.tsx's own
// beforeAll already establishes.
// Reports every observed element as visible at once, so lazily-mounted previews (AssetPdfPreview, via useHasBeenNearViewport) mount.
class IntersectionObserverMock {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn((element: Element) => {
    this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as never);
  });
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  // jsdom has no real 2D canvas context — PdfPageCanvas only needs a
  // truthy object to pass to the (mocked) page.render() call.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  // jsdom has no layout (every clientWidth is 0); the PDF preview waits for a measured width to fit page 1 to.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 200 });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildNotePage(markdown: string, pathSegment = 'Note.md'): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${pathSegment}`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-pdf-1',
    kind: 'pdf',
    name: 'document.pdf',
    path: `${ROOT}/document.pdf`,
    parentId: null,
    ...overrides,
  };
}

function makeApplication(page: Page, resources: VaultResource[]): Application {
  const vault = new Vault(
    ROOT,
    [page],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

/** Drains the CM6/pdf.js load microtask chain the same way embedLivePreview.pdf.test.ts's own `flush()` does. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('PageHost: the Assets collection plugs into the standard collection architecture (header controls, List / Table / Card)', () => {
  /** `layout`, when given, is saved before the view opens (the default for a first-time user is Card). */
  function setup(resources: VaultResource[], layout?: 'list' | 'table' | 'card') {
    const application = makeApplication(buildNotePage('x'), resources);
    if (layout) {
      application.collectionViewConfigStore.update('view:assets', { layout });
    }
    application.navigation.openAssets();
    return application;
  }
  const image = () =>
    makeResource({ id: 'img-1', kind: 'image', name: 'hero.png', path: `${ROOT}/hero.png` });
  const pdf = () => makeResource({ id: 'pdf-1', kind: 'pdf', name: 'doc.pdf', path: `${ROOT}/doc.pdf` });

  const settingsButton = () => document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  const menuLabels = () =>
    [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((item) => item.textContent?.trim());
  const openMenu = async () => {
    fireEvent.click(settingsButton()!);
    await flush();
  };

  it('shows the standard header controls — Settings / view mode and Add — rendered by the shared header actions', async () => {
    render(<AppLayout application={setup([image(), pdf()])} />);
    await flush();

    expect(settingsButton()).not.toBeNull();
    expect(document.querySelector('button[aria-label="Add asset"]')).not.toBeNull();
    // Same two controls, same order, as every other collection: Settings, then the primary Add.
    const actions = document.querySelector('button[aria-label="Add asset"]')!.parentElement!;
    expect([...actions.children].map((el) => el.getAttribute('aria-label') ?? el.getAttribute('aria-haspopup'))).toEqual([
      'menu',
      'Add asset',
    ]);
  });

  const pick = async (label: string) => {
    await openMenu();
    fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === label)!);
    await flush();
  };

  it('opens in Card for a first-time user (nothing saved), on the shared card grid', async () => {
    render(<AppLayout application={setup([image(), pdf()])} />);
    await flush();

    expect(document.querySelectorAll('.collection-grid > .collection-card--layout-overlay')).toHaveLength(2);
    expect(document.querySelector('.collection-list, .collection-table')).toBeNull();
  });

  it('a saved List is honoured over the default — the shared list rows notes use', async () => {
    render(<AppLayout application={setup([image(), pdf()], 'list')} />);
    await flush();

    expect(document.querySelectorAll('.collection-list > .collection-row')).toHaveLength(2);
    expect(document.querySelector('.collection-grid, .collection-table')).toBeNull();
    expect(document.body.textContent).toContain('hero');
    expect(document.body.textContent).toContain('doc');
  });

  it('offers the same three layouts notes have (List, Table, Card), Sort by (Name and the Properties: File size, Created, Last edited), and Properties', async () => {
    render(<AppLayout application={setup([image()])} />);
    await flush();
    await openMenu();

    expect(menuLabels()).toEqual(['List', 'Table', 'Card', 'Properties', 'Name', 'File size', 'Created', 'Last edited']);
    expect(document.body.textContent).toMatch(/Sort by/);
  });

  it('Table renders the generic table with just Name — the file-fact Properties add Size, Created, Last edited (the preview leads the name)', async () => {
    render(<AppLayout application={setup([image(), pdf()])} />);
    await flush();
    await pick('Table');

    expect([...document.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual([
      'Name',
    ]);
    expect(document.querySelectorAll('.collection-table__body > .collection-table-row')).toHaveLength(2);
  });

  it('Card renders the generic grid with a generic overlay card per asset', async () => {
    render(<AppLayout application={setup([image(), pdf()])} />);
    await flush();
    await pick('Card');

    const grid = document.querySelector('.collection-grid');
    expect(grid).not.toBeNull();
    const cards = [...grid!.querySelectorAll('.collection-card--layout-overlay')];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toHaveClass('collection-card');
    }
    // Not a note card, and none of the note-specific preview machinery.
    expect(document.querySelector('.collection-card:not(.collection-card--layout-overlay):not(.collection-card--empty)')).toBeNull();
    expect(document.querySelector('.note-page-canvas')).toBeNull();
  });

  it('an image asset renders its resolved image (the existing resource-URL resolver), fitted without a crop', async () => {
    const application = setup([image()]);
    render(<AppLayout application={application} />);
    await flush();
    await pick('Card');

    const img = document.querySelector<HTMLImageElement>('.collection-card__media img')!;
    expect(img.getAttribute('src')).toBe(application.resolveResourceImageUrl(`${ROOT}/hero.png`));
  });

  it("a PDF asset uses the existing PDF viewer pieces (pdf.js document + page canvas), not an image or Markdown", async () => {
    render(<AppLayout application={setup([pdf()])} />);
    await flush();
    await pick('Card');

    expect(document.querySelector('.asset-pdf-preview')).not.toBeNull();
    expect(document.querySelector('.collection-card__media img')).toBeNull();
    await waitFor(() => expect(document.querySelector('.asset-pdf-preview .pdf-viewer__page')).not.toBeNull());
  });

  it('clicking an asset card opens it through the same handler as a row (the PDF overlay for a PDF)', async () => {
    render(<AppLayout application={setup([pdf()])} />);
    await flush();
    await pick('Card');

    fireEvent.click(document.querySelector('.collection-card--layout-overlay')!);

    await waitFor(() => expect(document.querySelector('.pdf-overlay .pdf-viewer')).not.toBeNull());
  });

  it("remembers the layout per collection: the choice is persisted under the Assets key", async () => {
    const application = setup([image()]);
    render(<AppLayout application={application} />);
    await flush();
    await pick('Card');

    expect(application.collectionViewConfigStore.get('view:assets')?.layout).toBe('card');
  });

  it('a persisted Table layout is honoured (Assets support it) and a layout the collection never supported falls back to its default', async () => {
    const application = setup([image()]);
    application.collectionViewConfigStore.update('view:assets', { layout: 'table' });
    render(<AppLayout application={application} />);
    await flush();

    expect(document.querySelector('.collection-table')).not.toBeNull();
  });

  it('F2 on a focused row renames it through ResourceOperations — the same rename the sidebar uses', async () => {
    const application = setup([image()], 'list');
    const rename = vi.spyOn(application.resourceOperations, 'renameResource').mockResolvedValue(undefined as never);
    render(<AppLayout application={application} />);
    await flush();

    const row = document.querySelector<HTMLElement>('.collection-row')!;
    row.focus();
    fireEvent.keyDown(row, { key: 'F2' });
    await flush();
    const field = document.querySelector<HTMLElement>('[role="textbox"]')!;
    expect(field).not.toBeNull();
    fireEvent.input(field, { target: { textContent: 'banner' } });
    fireEvent.blur(field);

    expect(rename).toHaveBeenCalledWith('img-1', 'banner');
  });

  it('Sort by works through the standard menu: File size reorders the items and the choice is persisted under the Assets key', async () => {
    const application = setup(
      [
        makeResource({ id: 'pdf-a', kind: 'pdf', name: 'alpha.pdf', path: `${ROOT}/alpha.pdf`, metadata: { size: 10, createdAt: null, modifiedAt: null } }),
        makeResource({ id: 'img-b', kind: 'image', name: 'beta.png', path: `${ROOT}/beta.png`, metadata: { size: 900, createdAt: null, modifiedAt: null } }),
      ],
      'list'
    );
    render(<AppLayout application={application} />);
    await flush();

    const order = () =>
      [...document.querySelectorAll<HTMLElement>('.collection-row')].map((row) => row.dataset.resourceId);
    expect(order()).toEqual(['pdf-a', 'img-b']); // Name A→Z by default

    await openMenu();
    fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === 'File size')!);
    await flush();

    expect(order()).toEqual(['img-b', 'pdf-a']); // Largest first
    expect(application.collectionViewConfigStore.get('view:assets')?.sort).toEqual({ key: 'size', direction: 'down' });
  });

  it('a persisted sort Assets do not offer (a description) falls back to Name', async () => {
    const application = setup(
      [
        makeResource({ id: 'img-z', kind: 'image', name: 'zeta.png', path: `${ROOT}/zeta.png` }),
        makeResource({ id: 'img-a', kind: 'image', name: 'alpha.png', path: `${ROOT}/alpha.png` }),
      ],
      'list'
    );
    application.collectionViewConfigStore.update('view:assets', { sort: { key: 'description', direction: 'up' } });
    render(<AppLayout application={application} />);
    await flush();

    expect(
      [...document.querySelectorAll<HTMLElement>('.collection-row')].map((row) => row.dataset.resourceId)
    ).toEqual(['img-a', 'img-z']);
  });
});
