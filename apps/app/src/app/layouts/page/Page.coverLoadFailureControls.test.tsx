// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@components/toast/ToastProvider';
import { Page } from './Page';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn().mockResolvedValue('/tmp/photo.png') }));

// A cover whose image failed to load is collapsed out of view, but the note still has it. The title controls then
// offer "Cover image" and its picker, so a different cover (a local image included) replaces it directly, with no
// need to remove it first. A cover that loads keeps the existing menu.

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('clutter-cover-picker-source', 'upload');
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

const REMOTE = 'https://example.com/cover.jpg';

function renderPage(props: Partial<Parameters<typeof Page>[0]> = {}) {
  const handlers = { onSetCoverImage: vi.fn(), onSetCoverImageFromUpload: vi.fn(), onRemoveCoverImage: vi.fn(), onShowCoverImage: vi.fn() };
  render(
    <ToastProvider>
      <Page title="Note" body={<div />} coverImage={REMOTE} {...handlers} {...props} />
    </ToastProvider>
  );

  return handlers;
}

const coverImage = () => document.querySelector('img.page-cover__image') as HTMLImageElement;
const failCover = () => act(() => void fireEvent.error(coverImage()));
const loadCover = () => act(() => void fireEvent.load(coverImage()));
const headerMenuButton = () => document.querySelector('header [aria-label="More actions"]') as HTMLElement | null;
const openHeaderMenu = () => fireEvent.click(headerMenuButton()!);

describe.each(['side', 'above'] as const)('title controls, %s cover layout', (coverLayout) => {
  it('a cover that loaded keeps the existing menu: nothing to offer, so no Cover image item or menu', () => {
    renderPage({ coverLayout });
    loadCover();

    expect(headerMenuButton()).toBeNull();
    expect(screen.queryByText('Cover image')).toBeNull();
  });

  it('a failed cover offers Cover image, which opens the existing picker', () => {
    renderPage({ coverLayout });
    failCover();

    openHeaderMenu();
    fireEvent.click(screen.getByText('Cover image'));

    expect(document.querySelector('.image-picker')).not.toBeNull();
  });

  it('a local image from the device replaces the failed cover directly, without removing it first', async () => {
    const { onSetCoverImageFromUpload, onRemoveCoverImage } = renderPage({ coverLayout });
    failCover();
    openHeaderMenu();
    fireEvent.click(screen.getByText('Cover image'));

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(onSetCoverImageFromUpload).toHaveBeenCalledWith('/tmp/photo.png'));
    expect(onRemoveCoverImage).not.toHaveBeenCalled();
  });

  it('the failed cover stays hidden until replaced or removed, and the toast still offers Retry and Remove', () => {
    renderPage({ coverLayout });

    failCover();

    expect(document.querySelector('aside.page__cover')).toHaveAttribute('data-load-failed');
    expect(coverImage()).toHaveStyle({ visibility: 'hidden' });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('the item goes away again if the image loads (a retry or the connection returning)', () => {
    renderPage({ coverLayout });
    failCover();

    expect(headerMenuButton()).not.toBeNull();

    loadCover();

    expect(headerMenuButton()).toBeNull();
    expect(screen.queryByText('Cover image')).toBeNull();
  });
});

describe('title controls, a cover the note itself hides', () => {
  it('still offers Show cover image, not Cover image, while the image loads', () => {
    renderPage({ coverHidden: true });
    loadCover();

    openHeaderMenu();

    expect(screen.getByText('Show cover image')).toBeInTheDocument();
    expect(screen.queryByText('Cover image')).toBeNull();
  });
});
