// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
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
 * The inline PDF embed's More actions menu: its Position section (Left / Center / Right) rewrites
 * only the embed's own Markdown, through the real AppLayout -> PageHost -> MarkdownEditor ->
 * PdfEmbedWidget -> PdfEmbedMoreActions chain.
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


function openMoreActions(): void {
  const button = document.querySelector<HTMLButtonElement>('.cm-pdf-embed button[aria-label="More actions"]');
  expect(button).not.toBeNull();
  fireEvent.mouseDown(button!);
  fireEvent.click(button!);
}

function menuRows(): string[] {
  const menu = document.querySelector('.overlay__surface .menu');
  return Array.from(menu?.children ?? []).map((el) =>
    el.getAttribute('role') === 'separator' ? '---' : (el.textContent ?? '')
  );
}

function menuItem(label: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => el.textContent === label) ??
    null
  );
}

async function renderPdfNote(markdown: string): Promise<EditorView> {
  const page = buildNotePage(markdown);
  const application = makeApplication(page, [makeResource()]);
  await application.pageOperations.open(page.id);
  render(<AppLayout application={application} />);
  await flush();
  const editor = document.querySelector<HTMLElement>('.cm-editor');
  expect(editor).not.toBeNull();
  return EditorView.findFromDOM(editor!.parentElement as HTMLElement)!;
}

describe('PageHost: inline PDF embed More actions — Position', () => {
  it('opens with Position first (title, Left, Center, Right), a divider, then the resource actions, then Remove', async () => {
    await renderPdfNote('Body text\n\n![[document.pdf]]\n');
    openMoreActions();

    const rows = menuRows();
    expect(rows.slice(0, 5)).toEqual(['Position', 'Left', 'Center', 'Right', '---']);
    expect(rows[rows.length - 1]).toBe('Remove');
    expect(rows).toContain('Archive');
    expect(menuItem('Left')?.classList.contains('entry-selected')).toBe(true);
  });

  it('Center rewrites the embed with the alignment, moves it, and Left clears it again — the PDF itself is untouched', async () => {
    const view = await renderPdfNote('Body text\n\n![[document.pdf]]\n');

    openMoreActions();
    fireEvent.click(menuItem('Center')!);
    await flush();
    expect(view.state.doc.toString()).toMatch(/!\[\[document\.pdf\|[^\]]*center[^\]]*\]\]/);
    expect(view.state.doc.toString()).toContain('Body text');
    expect(document.querySelector<HTMLElement>('.cm-pdf-embed-container')?.dataset.align).toBe('center');

    openMoreActions();
    expect(menuItem('Center')?.classList.contains('entry-selected')).toBe(true);
    fireEvent.click(menuItem('Right')!);
    await flush();
    expect(view.state.doc.toString()).toContain('right');
    expect(view.state.doc.toString()).not.toContain('center');

    openMoreActions();
    fireEvent.click(menuItem('Left')!);
    await flush();
    expect(view.state.doc.toString()).toContain('![[document.pdf]]');
    expect(document.querySelector<HTMLElement>('.cm-pdf-embed-container')?.dataset.align).toBeUndefined();
  });

  it('keeps the width when the position changes', async () => {
    const view = await renderPdfNote('![[document.pdf|20]]\n');

    openMoreActions();
    fireEvent.click(menuItem('Right')!);
    await flush();

    expect(view.state.doc.toString()).toMatch(/!\[\[document\.pdf\|20,right\]\]/);
  });
});
