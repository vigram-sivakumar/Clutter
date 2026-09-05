// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for a real, confirmed bug: cancelling an in-flight
 * PDF page render while its text-layer phase is still running produced a
 * genuine unhandled promise rejection — `AbortException: TextLayer task
 * cancelled` — because `renderPdfPage`'s own async IIFE `await`ed
 * `textLayerBuilder.render(viewport)` with no `try`/`catch`, inside a body
 * invoked via `void (async () => {...})()`. `TextLayerBuilder.cancel()`
 * (pdf.js's own behavior) rejects that exact in-flight `render()` promise,
 * and nothing was there to catch it.
 *
 * This is a pre-existing defect in the rendering primitive itself, not
 * something specific to any one caller — `PdfEmbedWidget.ts`'s own
 * `renderCurrentPage` calls `renderHandle?.cancel()` before starting a
 * fresh render on every page-nav *and* on every resize commit, so any of
 * those, landing while the text-layer phase is mid-flight, could trigger
 * it. Fixed by wrapping the awaited call in `try`/`catch`, mirroring the
 * exact same "a cancelled render rejects by design, nothing to surface"
 * contract `renderTask.promise.catch(() => {})` already established for
 * the canvas half.
 */

const pdfjsMock = vi.hoisted(() => {
  let rejectRender: ((reason: unknown) => void) | null = null;
  return { rejectRender: (reason: unknown) => rejectRender?.(reason), setRejecter: (fn: (reason: unknown) => void) => (rejectRender = fn) };
});

vi.mock('pdfjs-dist', () => ({
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
    }
    render(): Promise<void> {
      // Never resolves on its own — only ever settled by the test calling
      // `pdfjsMock.rejectRender(...)`, simulating exactly what pdf.js's
      // own `TextLayerBuilder.cancel()` does to an in-flight `render()`.
      return new Promise((_resolve, reject) => {
        pdfjsMock.setRejecter(reject);
      });
    }
    cancel(): void {
      const AbortException = class extends Error {
        constructor() {
          super('TextLayer task cancelled.');
          this.name = 'AbortException';
        }
      };
      pdfjsMock.rejectRender(new AbortException());
    }
  }
  return { TextLayerBuilder: FakeTextLayerBuilder };
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('renderPdfPage — cancelling mid-text-layer-render never produces an unhandled rejection', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('calling cancel() while the text-layer render is still in flight does not reject unhandled', async () => {
    const { renderPdfPage } = await import('./pdfPageRenderer');

    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ({})) as unknown as HTMLCanvasElement['getContext'];
    const textLayerContainer = document.createElement('div');
    const containerEl = document.createElement('div');
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
      render: () => ({ promise: new Promise<void>(() => {}), cancel: vi.fn() }),
    };

    const handle = renderPdfPage({
      page: page as never,
      canvas,
      textLayerContainer,
      containerEl,
      scale: 1,
    });

    await flushMicrotasks(); // let the async IIFE reach the text-layer render() await

    // The exact trigger: a caller (PdfEmbedWidget.ts's renderCurrentPage,
    // on a resize commit or a page-nav) cancels a render whose text-layer
    // phase hasn't settled yet.
    handle.cancel();

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
