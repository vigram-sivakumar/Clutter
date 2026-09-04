// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// pdfjs-dist itself is mocked wholesale — this suite is about PdfViewer's
// own loading/error/zoom/page-navigation behavior, not pdfjs-dist's real
// rendering pipeline (that's Mozilla's own test suite's job). A fake
// getDocument()/getPage()/render() is enough to drive every state PdfViewer
// branches on.
let pendingDocResolve: ((doc: unknown) => void) | null = null;
let pendingDocReject: ((err: unknown) => void) | null = null;
let lastDestroy: ReturnType<typeof vi.fn> | null = null;

function makeFakePage() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    }),
    getTextContent: () =>
      Promise.resolve({ items: [{ str: 'fake text' }], styles: {} }),
  };
}

function makeFakeDoc(numPages: number) {
  return {
    numPages,
    getPage: vi.fn(() => Promise.resolve(makeFakePage())),
  };
}

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => {
    const promise = new Promise((resolve, reject) => {
      pendingDocResolve = resolve;
      pendingDocReject = reject;
    });
    lastDestroy = vi.fn();
    return { promise, destroy: lastDestroy };
  }),
  // Real devicePixelRatio-aware sizing (PdfPageCanvas.tsx) needs a real
  // OutputScale — jsdom's own window.devicePixelRatio is 1, so this is
  // effectively a no-op scale in this suite, same as it would be on a
  // non-HiDPI display.
  OutputScale: class {
    sx = window.devicePixelRatio || 1;
    sy = window.devicePixelRatio || 1;
    get scaled() {
      return this.sx !== 1 || this.sy !== 1;
    }
  },
}));

// TextLayerBuilder (pdfjs-dist/web/pdf_viewer.mjs) is exercised for real by
// PdfPageCanvas.test.tsx — here it just needs to not throw, since this
// suite is about PdfViewer's own toolbar/state behavior, not text-layer
// rendering specifics.
vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  TextLayerBuilder: class {
    div = document.createElement('div');
    async render() {}
    cancel() {}
  },
}));

import { PdfViewer } from './PdfViewer';

// A controllable ResizeObserver mock — jsdom has no real layout engine, so
// `clientWidth` never reflects an actual box size; `trigger()` lets a test
// simulate the browser calling this observer's callback after a real
// resize, once the test has stubbed the target's own `clientWidth` (see
// the Fit-Width tests below). One instance is created per PdfViewer mount
// (its own `.pdf-viewer__scroll` ResizeObserver effect) — `instances` is
// reset in `beforeEach` and the last one is always the current mount's.
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

/** Stubs an already-rendered `.pdf-viewer__scroll` element's `clientWidth` (jsdom never sets this from real layout) and fires the ResizeObserver callback so PdfViewer's own fit-scale effect recomputes against it — the one shared trigger every Fit-Width test below uses. */
function stubAvailableWidth(container: HTMLElement, clientWidth: number): void {
  const scrollEl = container.querySelector<HTMLElement>('.pdf-viewer__scroll');
  if (!scrollEl) {
    throw new Error('expected a .pdf-viewer__scroll element');
  }
  Object.defineProperty(scrollEl, 'clientWidth', { value: clientWidth, configurable: true });
  ResizeObserverMock.instances.at(-1)!.trigger();
}

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

beforeEach(() => {
  pendingDocResolve = null;
  pendingDocReject = null;
  lastDestroy = null;
  ResizeObserverMock.instances = [];
});

afterEach(() => {
  cleanup();
});

describe('PdfViewer — loading state', () => {
  it('shows a loading indicator before the document resolves', () => {
    render(<PdfViewer url="app:///vault/contract.pdf" title="contract.pdf" />);

    expect(screen.getByText('Loading PDF…')).toBeInTheDocument();
  });

  it('never shows browser-native PDF chrome — no iframe/embed/object element', () => {
    const { container } = render(
      <PdfViewer url="app:///vault/contract.pdf" title="contract.pdf" />
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('embed')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
  });
});

describe('PdfViewer — error state', () => {
  it('shows an error state when the document fails to load (corrupt/invalid PDF)', async () => {
    render(<PdfViewer url="app:///vault/broken.pdf" title="broken.pdf" />);

    await act(async () => {
      pendingDocReject!(new Error('Invalid PDF structure'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/couldn.?t open this pdf/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading PDF…')).not.toBeInTheDocument();
  });
});

describe('PdfViewer — ready state', () => {
  async function renderReady(numPages = 3) {
    const utils = render(
      <PdfViewer url="app:///vault/contract.pdf" title="contract.pdf" />
    );

    await act(async () => {
      pendingDocResolve!(makeFakeDoc(numPages));
      // One extra microtask hop past doc-ready: PdfViewer's own
      // pageBaseWidth effect fetches page 1 (`state.doc.getPage(1)`) before
      // the toolbar/pages are considered "ready" — see PdfViewer.tsx's own
      // `ready` gate.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    return utils;
  }

  it('renders one canvas per page, vertically stacked, once the document is ready', async () => {
    const { container } = await renderReady(3);

    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-viewer__page-canvas')).toHaveLength(3);
    });
  });

  it('shows the resolved filename in the toolbar', async () => {
    await renderReady(1);

    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
  });

  it('shows a zoom indicator and supports zoom in/out — jsdom has no layout, so the Fit-Width scale falls back to 100% here (see the dedicated Fit-Width suite below for the real computed-scale case)', async () => {
    await renderReady(1);

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows page navigation and a current-page indicator for a multi-page document', async () => {
    await renderReady(3);

    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled();
  });

  it('omits page navigation entirely for a single-page document', async () => {
    await renderReady(1);

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('has no explicit Close control — same as ImageOverlay, closing is Escape/backdrop-click (Overlay behavior), not re-implemented here', async () => {
    await renderReady(1);

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('shows no "More actions" control when no resourceId is supplied', async () => {
    await renderReady(1);

    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('shows no "More actions" control when resourceId is supplied but no action callback is — mirrors the Archive-view ImageOverlay call site, which omits resourceId entirely', async () => {
    render(
      <PdfViewer url="app:///vault/contract.pdf" title="contract.pdf" resourceId="resource-1" />
    );
    await act(async () => {
      pendingDocResolve!(makeFakeDoc(1));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('"More actions" shows the same Resource menu the sidebar exposes (Move to…, Reveal in Finder, Copy path, Archive — no Rename), dispatched with resourceId', async () => {
    const onArchiveResource = vi.fn();
    render(
      <PdfViewer
        url="app:///vault/contract.pdf"
        title="contract.pdf"
        resourceId="resource-1"
        onArchiveResource={onArchiveResource}
      />
    );
    await act(async () => {
      pendingDocResolve!(makeFakeDoc(1));
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Archive'));
    expect(onArchiveResource).toHaveBeenCalledWith('resource-1');
  });

  it('destroys the loading task on unmount', async () => {
    const { unmount } = await renderReady(1);

    unmount();

    expect(lastDestroy).toHaveBeenCalled();
  });
});

// The canonical zoom sequence: [50, 75, 100, 125, 150, 200, 250, 300, 400].
// The displayed percentage is the source of truth — `scale` is derived
// from it (percent / 100), never the reverse — so these tests assert
// against the exact canonical list, not a computed/rounded value.
const CANONICAL_ZOOM_SEQUENCE = [50, 75, 100, 125, 150, 200, 250, 300, 400];

describe('PdfViewer — canonical zoom', () => {
  // jsdom has no layout engine, so `.pdf-viewer__scroll`'s `clientWidth` is
  // always 0 here — the Fit-Width calculation (`computeFitScale`) falls
  // back to its documented 1 (100%) default whenever the available width
  // isn't measurable, which is exactly what makes 100% a stable starting
  // point for these manual-zoom-stepping tests. See the dedicated
  // "PdfViewer — Fit-Width" suite below for the real computed-scale case
  // (a stubbed non-zero `clientWidth`).
  async function renderReady() {
    const utils = render(<PdfViewer url="app:///vault/contract.pdf" title="contract.pdf" />);
    await act(async () => {
      pendingDocResolve!(makeFakeDoc(1));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    return utils;
  }

  function zoomIndicator(): string {
    return screen.getByText(/%$/).textContent!;
  }
  function clickZoomIn(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  }
  function clickZoomOut(): void {
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  }

  it('opens at the Fit-Width default, which falls back to exactly 100% when no available width can be measured', async () => {
    await renderReady();

    expect(zoomIndicator()).toBe('100%');
  });

  it('zoom in from 100% moves to exactly the next canonical value (125%)', async () => {
    await renderReady();

    clickZoomIn();

    expect(zoomIndicator()).toBe('125%');
  });

  it('zoom out from 100% moves to exactly the previous canonical value (75%)', async () => {
    await renderReady();

    clickZoomOut();

    expect(zoomIndicator()).toBe('75%');
  });

  it('repeated zoom in walks the full canonical sequence, in order, with no other values ever appearing', async () => {
    await renderReady();

    const observed = [zoomIndicator()];
    for (let i = 0; i < CANONICAL_ZOOM_SEQUENCE.length + 2; i++) {
      clickZoomIn();
      observed.push(zoomIndicator());
    }

    // Every observed value is one of the canonical percentages — this is
    // the direct assertion against "never produce 98%, 96%, 103%, etc."
    for (const value of observed) {
      expect(CANONICAL_ZOOM_SEQUENCE).toContain(Number(value.replace('%', '')));
    }
    // And specifically: starting at 100%, it walks every remaining
    // canonical value up to the max, then stays clamped there.
    expect(observed).toEqual([
      '100%', '125%', '150%', '200%', '250%', '300%', '400%',
      '400%', '400%', '400%', '400%', '400%',
    ]);
  });

  it('repeated zoom out walks the full canonical sequence downward, in order, then clamps at the minimum', async () => {
    await renderReady();

    const observed = [zoomIndicator()];
    for (let i = 0; i < CANONICAL_ZOOM_SEQUENCE.length + 2; i++) {
      clickZoomOut();
      observed.push(zoomIndicator());
    }

    expect(observed).toEqual([
      '100%', '75%', '50%', '50%', '50%', '50%',
      '50%', '50%', '50%', '50%', '50%', '50%',
    ]);
  });

  it('reaching the maximum (400%) disables Zoom in, and further clicks are no-ops', async () => {
    await renderReady();

    for (let i = 0; i < CANONICAL_ZOOM_SEQUENCE.length; i++) {
      clickZoomIn();
    }

    expect(zoomIndicator()).toBe('400%');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

    clickZoomIn();
    expect(zoomIndicator()).toBe('400%');
  });

  it('reaching the minimum (50%) disables Zoom out, and further clicks are no-ops', async () => {
    await renderReady();

    for (let i = 0; i < CANONICAL_ZOOM_SEQUENCE.length; i++) {
      clickZoomOut();
    }

    expect(zoomIndicator()).toBe('50%');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

    clickZoomOut();
    expect(zoomIndicator()).toBe('50%');
  });

  it('is fully deterministic and reversible — no floating-point drift across a long back-and-forth sequence (100→125→150→100→75→100)', async () => {
    await renderReady();

    clickZoomIn(); // 125
    clickZoomIn(); // 150
    clickZoomOut(); // 125
    clickZoomOut(); // 100
    clickZoomOut(); // 75
    clickZoomIn(); // 100

    expect(zoomIndicator()).toBe('100%');
  });

  it('the displayed percentage is always exactly one of the canonical values, at every step of a long random-ish walk', async () => {
    await renderReady();

    // A long, mixed in/out sequence — the point is that no intermediate
    // step ever produces a non-canonical value (the old repeated
    // multiply/divide-by-1.15 implementation would drift to values like
    // 98%/96%/103% here).
    const clicks = [1, 1, -1, 1, -1, -1, 1, 1, 1, -1, 1, -1, -1, -1, 1];
    for (const direction of clicks) {
      if (direction > 0) {
        clickZoomIn();
      } else {
        clickZoomOut();
      }
      const percent = Number(zoomIndicator().replace('%', ''));
      expect(CANONICAL_ZOOM_SEQUENCE).toContain(percent);
    }
  });
});

// The fake page's own base width at scale 1 (`makeFakePage`'s
// `getViewport`) is 600 — every fit-scale expectation below is
// `stubbedClientWidth / 600`.
describe('PdfViewer — Fit-Width', () => {
  async function renderReadyAtWidth(clientWidth: number, numPages = 1) {
    const utils = render(<PdfViewer url="app:///vault/contract.pdf" title="contract.pdf" />);
    stubAvailableWidth(utils.container, clientWidth);

    await act(async () => {
      pendingDocResolve!(makeFakeDoc(numPages));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    return utils;
  }

  it('computes the real Fit-Width scale from the container’s own available width — the page fills that width, not a forced 100%', async () => {
    // 822 / 600 = 1.37 -> 137%, deliberately not a canonical zoom level.
    await renderReadyAtWidth(822);

    await waitFor(() => {
      expect(screen.getByText('137%')).toBeInTheDocument();
    });
  });

  it('recalculates the fit scale on resize while still in Fit-Width state', async () => {
    const { container } = await renderReadyAtWidth(600);
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());

    act(() => {
      stubAvailableWidth(container, 1200);
    });

    await waitFor(() => {
      expect(screen.getByText('200%')).toBeInTheDocument();
    });
  });

  it('never overrides a manually chosen zoom level on a later resize', async () => {
    const { container } = await renderReadyAtWidth(600);
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();

    act(() => {
      stubAvailableWidth(container, 1200);
    });

    // Still 125% — once the user has zoomed manually, a resize must never
    // silently override their choice (it would otherwise jump to 200%,
    // matching the previous "recalculates on resize" test).
    expect(screen.getByText('125%')).toBeInTheDocument();
    expect(screen.queryByText('200%')).not.toBeInTheDocument();
  });

  it('zooming in from a non-canonical fit scale steps to the next canonical value strictly above it, not the nearest one below', async () => {
    await renderReadyAtWidth(822); // 137%
    await waitFor(() => expect(screen.getByText('137%')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('zooming out from a non-canonical fit scale steps to the next canonical value strictly below it', async () => {
    await renderReadyAtWidth(822); // 137%
    await waitFor(() => expect(screen.getByText('137%')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
  });
});
