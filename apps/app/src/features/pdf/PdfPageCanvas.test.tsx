// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// A fake TextLayerBuilder that actually inserts a real DOM span for the
// page's text — this is the core assertion surface for the "not a
// flattened bitmap, and not just correctly-positioned-but-unselectable
// spans either" requirement: real, selectable <span> text nodes must land
// in the DOM inside the builder's own `.div`, mirroring pdfjs-dist's own
// `pdfjs-dist/web/pdf_viewer.mjs` TextLayerBuilder — see PdfPageCanvas.tsx's
// own doc comment for why TextLayerBuilder (not the bare TextLayer
// primitive) is what's used here.
//
// Everything the vi.mock(...) factories below need to reference must live
// inside this one vi.hoisted() call — vi.mock() factories are hoisted
// above every import/top-level statement, so a plain top-level `let`/
// `class` referenced from inside one throws ReferenceError: Cannot access
// '...' before initialization.
const pdfjsMock = vi.hoisted(() => {
  const state: { lastPdfPage: unknown; lastRenderViewport: unknown } = {
    lastPdfPage: null,
    lastRenderViewport: null,
  };
  return { state };
});

vi.mock('pdfjs-dist', () => {
  class FakeOutputScale {
    sx = 1;
    sy = 1;
    get scaled() {
      return this.sx !== 1 || this.sy !== 1;
    }
  }

  return {
    OutputScale: FakeOutputScale,
  };
});

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => {
  const cancelSpy = vi.fn();
  const renderSpy = vi.fn();

  class FakeTextLayerBuilder {
    div: HTMLDivElement;
    constructor({ pdfPage }: { pdfPage: unknown }) {
      pdfjsMock.state.lastPdfPage = pdfPage;
      this.div = document.createElement('div');
      this.div.className = 'textLayer';
    }
    async render(viewport: unknown) {
      renderSpy(viewport);
      pdfjsMock.state.lastRenderViewport = viewport;
      const span = document.createElement('span');
      span.textContent = 'Selectable page text';
      this.div.appendChild(span);
    }
    cancel() {
      cancelSpy();
    }
  }

  return {
    TextLayerBuilder: FakeTextLayerBuilder,
    __cancelSpy: cancelSpy,
    __renderSpy: renderSpy,
  };
});

import * as pdfViewerMjs from 'pdfjs-dist/web/pdf_viewer.mjs';
import { PdfPageCanvas } from './PdfPageCanvas';

const cancelSpy = (pdfViewerMjs as unknown as { __cancelSpy: ReturnType<typeof vi.fn> })
  .__cancelSpy;
const renderSpy = (pdfViewerMjs as unknown as { __renderSpy: ReturnType<typeof vi.fn> })
  .__renderSpy;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
  );
});

afterEach(() => {
  cleanup();
  pdfjsMock.state.lastPdfPage = null;
  pdfjsMock.state.lastRenderViewport = null;
  cancelSpy.mockClear();
  renderSpy.mockClear();
});

function makePage() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
}

function makeDoc() {
  return { getPage: vi.fn(() => Promise.resolve(makePage())) };
}

describe('PdfPageCanvas — text layer', () => {
  it('renders a canvas AND a real selectable text span — never canvas-only', async () => {
    const doc = makeDoc();
    const { container } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />
    );

    await waitFor(() => {
      expect(container.querySelector('.pdf-viewer__page-canvas')).toBeInTheDocument();
      expect(container.querySelector('.textLayer')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(container.querySelector('.textLayer')?.textContent).toBe('Selectable page text');
    });
  });

  it('builds the TextLayerBuilder from the same PDFPageProxy the canvas renders, and renders it at the same viewport/scale', async () => {
    const doc = makeDoc();
    render(<PdfPageCanvas doc={doc as never} pageNumber={1} scale={2} onVisible={vi.fn()} />);

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalled();
    });

    expect(pdfjsMock.state.lastPdfPage).not.toBeNull();
    const viewport = pdfjsMock.state.lastRenderViewport as { width: number; height: number };
    expect(viewport.width).toBe(1200); // 600 * scale(2)
    expect(viewport.height).toBe(1600); // 800 * scale(2)
  });

  it('cancels the previous text layer render when scale changes — no stale/duplicate text runs', async () => {
    const doc = makeDoc();
    const { rerender } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />
    );

    await waitFor(() => expect(renderSpy).toHaveBeenCalled());

    await act(async () => {
      rerender(
        <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1.5} onVisible={vi.fn()} />
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(cancelSpy).toHaveBeenCalled());
  });

  it('cancels the text layer render on unmount', async () => {
    const doc = makeDoc();
    const { unmount } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />
    );

    await waitFor(() => expect(renderSpy).toHaveBeenCalled());

    unmount();

    expect(cancelSpy).toHaveBeenCalled();
  });
});
