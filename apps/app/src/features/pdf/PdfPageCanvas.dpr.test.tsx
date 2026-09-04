// @vitest-environment jsdom

// Dedicated suite for the devicePixelRatio backing-store fix — kept
// separate from PdfPageCanvas.test.tsx (which deliberately runs with an
// unscaled 1:1 OutputScale to keep its own text-layer-alignment
// assertions simple) so this file can mock a HiDPI (dpr=2) OutputScale
// without affecting that suite.
//
// Root cause this guards against: the canvas backing store was sized
// identically to its CSS display size at every zoom level (measured
// directly: ratio was a flat 1.0 from 50% to 400%), so on any
// devicePixelRatio>1 display the canvas was permanently under-resolved by
// exactly devicePixelRatio, regardless of zoom — visible as blur at low
// zoom and imperceptible (not fixed, just too small to notice) at high
// zoom. The fix: backing store = viewport × devicePixelRatio (capped),
// CSS box = viewport (unscaled), plus a render `transform` so drawing
// commands still fill the larger backing store correctly.

import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dprMock = vi.hoisted(() => ({ dpr: 2 }));

vi.mock('pdfjs-dist', () => ({
  OutputScale: class {
    sx = dprMock.dpr;
    sy = dprMock.dpr;
    get scaled() {
      return this.sx !== 1 || this.sy !== 1;
    }
  },
}));

// Not this suite's concern (see PdfPageCanvas.test.tsx for real text-layer
// coverage) — just needs to not throw, since PdfPageCanvas mounts a
// TextLayerBuilder alongside the canvas on every render this suite drives.
vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  TextLayerBuilder: class {
    div = document.createElement('div');
    async render() {}
    cancel() {}
  },
}));

import { PdfPageCanvas } from './PdfPageCanvas';

let lastRenderCall: { transform?: unknown } | null = null;

function makePage(nativeWidth: number, nativeHeight: number) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: nativeWidth * scale,
      height: nativeHeight * scale,
    }),
    render: (params: { transform?: unknown }) => {
      lastRenderCall = params;
      return { promise: Promise.resolve(), cancel: vi.fn() };
    },
    getTextContent: () => Promise.resolve({ items: [], styles: {} }),
  };
}

function makeDoc(nativeWidth: number, nativeHeight: number) {
  return { getPage: vi.fn(() => Promise.resolve(makePage(nativeWidth, nativeHeight))) };
}

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
  lastRenderCall = null;
  dprMock.dpr = 2;
});

describe('PdfPageCanvas — devicePixelRatio-aware backing store', () => {
  it('at 100% zoom on a dpr=2 display: backing store is 2x the CSS display size, not 1:1', async () => {
    // Native page 612x792 (US Letter, matching the real measurement in
    // this investigation), scale=1 (100%).
    const doc = makeDoc(612, 792);
    const { container } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />
    );

    await waitFor(() => {
      const canvas = container.querySelector('canvas')!;
      expect(canvas.width).toBe(1224); // 612 * dpr(2)
      expect(canvas.height).toBe(1584); // 792 * dpr(2)
      expect(canvas.style.width).toBe('612px'); // CSS box stays at logical size
      expect(canvas.style.height).toBe('792px');
    });
  });

  it('the backing/CSS ratio equals devicePixelRatio at every zoom level, not just at one', async () => {
    for (const scale of [0.5, 1, 1.49, 2, 3, 4]) {
      cleanup();
      const doc = makeDoc(612, 792);
      const { container } = render(
        <PdfPageCanvas doc={doc as never} pageNumber={1} scale={scale} onVisible={vi.fn()} />
      );

      await waitFor(() => {
        const canvas = container.querySelector('canvas')!;
        const cssWidth = parseFloat(canvas.style.width);
        const ratio = canvas.width / cssWidth;
        expect(ratio).toBeCloseTo(2, 1); // devicePixelRatio, regardless of scale
      });
    }
  });

  it('passes a render transform matching the output scale, so drawing still fills the larger backing store', async () => {
    const doc = makeDoc(612, 792);
    render(<PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />);

    await waitFor(() => {
      expect(lastRenderCall?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    });
  });

  it('omits the transform entirely when devicePixelRatio is 1 — no unnecessary scaling on a standard display', async () => {
    dprMock.dpr = 1;
    const doc = makeDoc(612, 792);
    const { container } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={1} onVisible={vi.fn()} />
    );

    await waitFor(() => {
      const canvas = container.querySelector('canvas')!;
      expect(canvas.width).toBe(612);
      expect(canvas.style.width).toBe('612px');
      expect(lastRenderCall?.transform).toBeUndefined();
    });
  });

  it('caps the backing store at a fixed pixel budget instead of growing unbounded (high zoom × high dpr)', async () => {
    dprMock.dpr = 3;
    // Letter page (612x792) at scale=4 (400%) -> logical viewport
    // 2448x3168 (~7.76M px, comfortably under budget at 1x). At an
    // uncapped dpr=3 that's 7344x9504 (~69.8M px) — over the 33.5M budget,
    // so the cap must kick in and reduce the *effective* dpr below 3,
    // without falling all the way back to the under-resolved 1x baseline
    // this whole fix exists to avoid.
    const doc = makeDoc(612, 792);
    const { container } = render(
      <PdfPageCanvas doc={doc as never} pageNumber={1} scale={4} onVisible={vi.fn()} />
    );

    await waitFor(() => {
      const canvas = container.querySelector('canvas')!;
      const backingPixels = canvas.width * canvas.height;
      // Under the budget — the cap engaged.
      expect(backingPixels).toBeLessThanOrEqual(33_554_432);
      // But still meaningfully above the naive 1x (2448) it would have
      // regressed to without a proportional cap — the fix's benefit is
      // reduced at this extreme, not discarded entirely.
      expect(canvas.width).toBeGreaterThan(2448);
      expect(canvas.width).toBeLessThan(2448 * 3); // less than uncapped dpr=3
    });
  });
});
