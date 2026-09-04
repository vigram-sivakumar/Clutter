// @vitest-environment jsdom

// Dedicated suite for the `--scale-factor` text-layer coordinate-space fix
// — kept separate from PdfPageCanvas.test.tsx/.dpr.test.tsx so this file's
// assertions stay focused on the one property those suites don't check.
//
// Root cause this guards against: PDF.js's own `TextLayer`/
// `setLayerDimensions` never set the `--scale-factor` CSS custom property
// themselves — pdf.js's reference viewer (pdf_viewer.mjs) always sets it
// on a page-level container as part of its own integration
// (`container.style.setProperty('--scale-factor', viewport.scale)`). We
// never did. Every `calc(var(--scale-factor) * Npx)` expression pdf.js's
// TextLayer uses for a span's font-size was therefore invalid at
// computed-value time and silently fell back to the INHERITED font-size
// (Clutter's own ~13px UI body text) instead of the PDF's actual scaled
// font size — verified directly in a real browser: before this fix,
// `getComputedStyle(span).fontSize` was a flat 13px at every zoom level;
// after, it tracked `viewport.scale` exactly (e.g. 26.09px at 145% for an
// 18pt heading). This is what made selection highlight geometry diverge
// from the visible (correctly-rendered, unaffected-canvas) text at any
// zoom other than the one where 13px happened to be close to correct.

import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
  OutputScale: class {
    sx = 1;
    sy = 1;
    get scaled() {
      return false;
    }
  },
}));

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  TextLayerBuilder: class {
    div = document.createElement('div');
    async render() {}
    cancel() {}
  },
}));

import { PdfPageCanvas } from './PdfPageCanvas';

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
});

function makePage(nativeWidth: number, nativeHeight: number) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: nativeWidth * scale,
      height: nativeHeight * scale,
      scale,
    }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
}

function makeDoc(nativeWidth = 612, nativeHeight = 792) {
  return { getPage: vi.fn(() => Promise.resolve(makePage(nativeWidth, nativeHeight))) };
}

describe('PdfPageCanvas — --scale-factor', () => {
  it.each([
    [0.5, '0.5'],
    [0.75, '0.75'],
    [1, '1'],
    [1.25, '1.25'],
    [1.5, '1.5'],
    [2, '2'],
    [2.5, '2.5'],
    [3, '3'],
    [4, '4'],
  ])(
    'sets --scale-factor on the page container to exactly the current canonical scale (%s)',
    async (scale, expected) => {
      const doc = makeDoc();
      const { container } = render(
        <PdfPageCanvas doc={doc as never} pageNumber={1} scale={scale} onVisible={vi.fn()} />
      );

      await waitFor(() => {
        const page = container.querySelector('.pdf-viewer__page') as HTMLElement;
        expect(page.style.getPropertyValue('--scale-factor')).toBe(expected);
      });
    }
  );

  it('updates --scale-factor when scale changes (zoom in/out), not just on first mount', async () => {
    const doc = makeDoc();
    const { container, rerender } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />
    );
    const page = () => container.querySelector('.pdf-viewer__page') as HTMLElement;

    await waitFor(() => {
      expect(page().style.getPropertyValue('--scale-factor')).toBe('1');
    });

    rerender(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1.5} onVisible={vi.fn()} />
    );

    await waitFor(() => {
      expect(page().style.getPropertyValue('--scale-factor')).toBe('1.5');
    });
  });

  it('--scale-factor matches the viewport.scale actually used for the canvas at the same render pass — one shared source, never two independently-computed values', async () => {
    // A distinctive non-round scale makes it obvious if canvas sizing and
    // --scale-factor ever derive from two different computations instead
    // of the same `viewport`.
    const scale = 1.4493464052287581;
    const doc = makeDoc();
    const { container } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={scale} onVisible={vi.fn()} />
    );

    await waitFor(() => {
      const page = container.querySelector('.pdf-viewer__page') as HTMLElement;
      const canvas = container.querySelector('canvas') as HTMLCanvasElement;
      expect(page.style.getPropertyValue('--scale-factor')).toBe(String(scale));
      // Canvas CSS width is the same logical viewport width --scale-factor
      // is derived from — 612 (native) * scale, floored.
      expect(canvas.style.width).toBe(`${Math.floor(612 * scale)}px`);
    });
  });
});
