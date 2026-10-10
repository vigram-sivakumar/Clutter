// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '../../MarkdownEditor';
import type { ResolveEmbedImage } from '../embed/embedImageResolution';
import type { EmbedPdfResolution, ResolveEmbedPdf } from './embedPdfResolution';

// Same PDF.js mocking shape embedLivePreview.pdf.test.ts already
// establishes — this suite is about the "More actions" menu's own
// Remove/Download/Archive separation (product rule: embed-level actions
// never touch the source resource), not pdfjs-dist's real rendering
// pipeline.
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

const declineImage: ResolveEmbedImage = () => ({ status: 'unresolved', alt: '' });
const resolvePdf: ResolveEmbedPdf = (path): EmbedPdfResolution =>
  path === 'document.pdf'
    ? { status: 'pdf', url: 'app://vault/document.pdf', title: 'document', path: 'document.pdf', resourceId: 'resource-1' }
    : { status: 'non-pdf' };

const PDF_MD = '![[document.pdf]]';

function findMenuItem(label: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (el) => el.textContent === label
    ) ?? null
  );
}

function openMoreActionsMenu() {
  const button = document.querySelector<HTMLButtonElement>('.cm-pdf-embed button[aria-label="More actions"]')!;
  fireEvent.mouseDown(button);
  fireEvent.click(button);
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
});

describe('PDF embed "More actions" — Remove/Download/Archive separation', () => {
  it('lists Position first, then Download, Move to…, Reveal in Finder, Copy path, Archive, then Remove last — with a divider directly above Remove', () => {
    const onDownloadPdfResource = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={PDF_MD}
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={resolvePdf}
        onDownloadPdfResource={onDownloadPdfResource}
      />
    );
    openMoreActionsMenu();

    const menu = document.querySelector('[role="menu"]')!;
    const labels = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent
    );
    // Position (how the embed sits) comes first; then the resource's own actions; Remove last.
    expect(labels).toEqual([
      'Left',
      'Center',
      'Download',
      'Move to…',
      'Reveal in Finder',
      'Copy path',
      'Move to Trash',
      'Remove',
    ]);

    // The divider sits immediately before Remove, not anywhere else — and one more separates the
    // Position section from the resource actions.
    const children = Array.from(menu.children);
    const removeIndex = children.findIndex((el) => el.textContent === 'Remove');
    expect(children[removeIndex - 1]?.getAttribute('role')).toBe('separator');
    const rows = children.map((el) => (el.getAttribute('role') === 'separator' ? '---' : (el.textContent ?? '')));
    expect(rows.slice(0, 4)).toEqual(['Position', 'Left', 'Center', '---']);
  });

  it('Remove only edits the current note\'s Markdown — never calls onArchiveResource or any other resource action', () => {
    const onEdit = vi.fn();
    const onArchiveResource = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={`Before\n\n${PDF_MD}\n\nAfter`}
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={resolvePdf}
        onEdit={onEdit}
        onArchiveResource={onArchiveResource}
      />
    );
    openMoreActionsMenu();

    fireEvent.click(findMenuItem('Remove')!);

    expect(onEdit).toHaveBeenCalledWith('Before\n\nAfter');
    expect(onArchiveResource).not.toHaveBeenCalled();
  });

  it('omits Download when onDownloadPdfResource is not supplied', () => {
    render(<MarkdownEditor pageId="test-page" markdown={PDF_MD} resolveEmbedImage={declineImage} resolveEmbedPdf={resolvePdf} />);
    openMoreActionsMenu();

    expect(findMenuItem('Download')).toBeNull();
  });

  it('Download forwards the embed\'s already-resolved resourceId when supplied', () => {
    const onDownloadPdfResource = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={PDF_MD}
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={resolvePdf}
        onDownloadPdfResource={onDownloadPdfResource}
      />
    );
    openMoreActionsMenu();

    fireEvent.click(findMenuItem('Download')!);

    expect(onDownloadPdfResource).toHaveBeenCalledWith('resource-1');
  });

  it('Archive is unchanged — still a real source-resource operation, still calls onArchiveResource', () => {
    const onArchiveResource = vi.fn();
    render(
      <MarkdownEditor
        pageId="test-page"
        markdown={PDF_MD}
        resolveEmbedImage={declineImage}
        resolveEmbedPdf={resolvePdf}
        onArchiveResource={onArchiveResource}
      />
    );
    openMoreActionsMenu();

    fireEvent.click(findMenuItem('Move to Trash')!);

    expect(onArchiveResource).toHaveBeenCalledWith('resource-1');
  });
});
