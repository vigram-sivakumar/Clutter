// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { VaultResource } from '@core/vault/models/VaultResource';

// PdfViewer itself (and therefore pdfjs-dist) is mocked out here — this
// suite is about PdfOverlay's own shell behavior (Overlay wiring, URL
// resolution, resource-null gating), already covered end-to-end for the
// real viewer in PdfViewer.test.tsx.
vi.mock('./PdfViewer', () => ({
  PdfViewer: ({ url, title }: { url: string; title: string }) => (
    <div data-testid="fake-pdf-viewer" data-url={url}>
      {title}
    </div>
  ),
}));

import { PdfOverlay } from './PdfOverlay';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const resource: VaultResource = {
  id: 'resource-1',
  kind: 'pdf',
  name: 'contract.pdf',
  path: '/vault/contract.pdf',
  parentId: null,
};

describe('PdfOverlay', () => {
  it('renders nothing (Overlay closed) when resource is null', () => {
    render(
      <PdfOverlay resource={null} onClose={vi.fn()} resolveResourceUrl={(p) => p} />
    );

    expect(screen.queryByTestId('fake-pdf-viewer')).not.toBeInTheDocument();
  });

  it('resolves the resource path through the injected resolveResourceUrl and passes the result + name to PdfViewer', () => {
    const resolveResourceUrl = vi.fn((path: string) => `app://${path}`);
    render(
      <PdfOverlay
        resource={resource}
        onClose={vi.fn()}
        resolveResourceUrl={resolveResourceUrl}
      />
    );

    expect(resolveResourceUrl).toHaveBeenCalledWith('/vault/contract.pdf');
    const viewer = screen.getByTestId('fake-pdf-viewer');
    expect(viewer).toHaveAttribute('data-url', 'app:///vault/contract.pdf');
    expect(viewer).toHaveTextContent('contract.pdf');
  });

  it('Escape closes the overlay — reuses Overlay behavior unmodified', () => {
    const onClose = vi.fn();
    render(
      <PdfOverlay resource={resource} onClose={onClose} resolveResourceUrl={(p) => p} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('a backdrop click closes the overlay — reuses Overlay behavior unmodified', () => {
    const onClose = vi.fn();
    render(
      <PdfOverlay resource={resource} onClose={onClose} resolveResourceUrl={(p) => p} />
    );

    const backdrop = document.querySelector('.overlay__backdrop');
    if (!backdrop) {
      throw new Error('expected a backdrop element');
    }
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  it('does not render ImageOverlay-only markup — a separate, independent overlay mount', () => {
    render(
      <PdfOverlay resource={resource} onClose={vi.fn()} resolveResourceUrl={(p) => p} />
    );

    expect(document.querySelector('.image-overlay__img')).toBeNull();
  });
});
