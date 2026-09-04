// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PageHost } from './PageHost';
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
class IntersectionObserverMock {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  // jsdom has no real 2D canvas context — PdfPageCanvas only needs a
  // truthy object to pass to the (mocked) page.render() call.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
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

describe('PageHost: inline PDF embed Expand control opens the real PdfOverlay', () => {
  it('clicking Expand on a rendered ![[document.pdf]] embed opens PdfOverlay showing the same resource', async () => {
    const page = buildNotePage('Body text\n\n![[document.pdf]]\n');
    const resource = makeResource();
    const application = makeApplication(page, [resource]);
    await application.pageOperations.open(page.id);

    render(<PageHost application={application} />);
    await flush();

    // Before Expand: the inline embed rendered, no overlay yet.
    expect(document.querySelector('.cm-pdf-embed')).not.toBeNull();
    expect(document.querySelector('.pdf-overlay .pdf-viewer')).toBeNull();

    const expandButton = document.querySelector<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="Expand"]'
    );
    expect(expandButton).not.toBeNull();

    fireEvent.click(expandButton!);

    // The actual bug this regression guards: the widget-level callback
    // firing is not proof the overlay opened — assert the rendered
    // PdfOverlay/PdfViewer DOM itself, showing the exact same resource.
    await waitFor(() => {
      expect(document.querySelector('.pdf-overlay .pdf-viewer')).not.toBeNull();
    });
    expect(document.querySelector('.pdf-overlay .pdf-viewer__title')?.textContent).toBe('document.pdf');
  });

  it('works for a PDF whose filename contains spaces', async () => {
    const page = buildNotePage('![[Meeting Notes.pdf]]\n');
    const resource = makeResource({
      id: 'resource-pdf-spaces',
      name: 'Meeting Notes.pdf',
      path: `${ROOT}/Meeting Notes.pdf`,
    });
    const application = makeApplication(page, [resource]);
    await application.pageOperations.open(page.id);

    render(<PageHost application={application} />);
    await flush();

    const expandButton = document.querySelector<HTMLButtonElement>(
      '.cm-pdf-embed button[aria-label="Expand"]'
    );
    expect(expandButton).not.toBeNull();

    fireEvent.click(expandButton!);

    await waitFor(() => {
      expect(document.querySelector('.pdf-overlay .pdf-viewer')).not.toBeNull();
    });
    expect(document.querySelector('.pdf-overlay .pdf-viewer__title')?.textContent).toBe('Meeting Notes.pdf');
  });
});
