// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchPhotos, trackPhotoDownload } from '@core/integrations/unsplash/UnsplashApi';
import { PageCover } from './Page.Cover';

vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  UNSPLASH_SHUFFLE_MAX_PAGE: 10,
  searchPhotos: vi.fn(),
  trackPhotoDownload: vi.fn().mockResolvedValue(true),
}));
vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const photo = (id: string, name: string) => ({
  id,
  urls: {
    small: `https://images.unsplash.com/${id}?ixid=${id}&w=400`,
    regular: `https://images.unsplash.com/${id}?ixid=${id}&w=1080`,
  },
  user: { name, links: { html: `https://unsplash.com/@${id}` } },
  links: { downloadLocation: `https://api.unsplash.com/photos/${id}/download?ixid=${id}` },
});

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  localStorage.setItem('clutter-cover-picker-source', 'unsplash');
  vi.mocked(searchPhotos).mockResolvedValue([photo('a', 'Alex Doe'), photo('b', 'Bea Roe')]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('PageCover — choosing an Unsplash photo end to end (picker → cover callback → tracking)', () => {
  it('hands the photo’s URL and credit to onSetCoverImage, tracking once per committed pick — replacements included', async () => {
    const onSetCoverImage = vi.fn();
    const { container } = render(<PageCover src="https://example.com/old.png" onSetCoverImage={onSetCoverImage} />);

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Change cover image'));
    await waitFor(() => expect(container.ownerDocument.querySelectorAll('.image-picker-unsplash__image')).toHaveLength(2));

    // Opening the picker and looking at photos tracks nothing.
    expect(trackPhotoDownload).not.toHaveBeenCalled();
    expect(onSetCoverImage).not.toHaveBeenCalled();

    const tiles = container.ownerDocument.querySelectorAll<HTMLElement>('.image-picker-unsplash__item');
    fireEvent.click(tiles[1]!); // first photo (tile 0 is Shuffle)

    expect(onSetCoverImage).toHaveBeenLastCalledWith('https://images.unsplash.com/a?ixid=a&w=3200', {
      name: 'Alex Doe',
      url: 'https://unsplash.com/@a',
      downloadLocation: 'https://api.unsplash.com/photos/a/download?ixid=a',
    });
    expect(trackPhotoDownload).toHaveBeenCalledTimes(1);
    expect(trackPhotoDownload).toHaveBeenLastCalledWith('https://api.unsplash.com/photos/a/download?ixid=a');

    fireEvent.click(tiles[2]!); // a different photo replaces it

    expect(onSetCoverImage).toHaveBeenLastCalledWith('https://images.unsplash.com/b?ixid=b&w=3200', {
      name: 'Bea Roe',
      url: 'https://unsplash.com/@b',
      downloadLocation: 'https://api.unsplash.com/photos/b/download?ixid=b',
    });
    expect(trackPhotoDownload).toHaveBeenCalledTimes(2);
    expect(trackPhotoDownload).toHaveBeenLastCalledWith('https://api.unsplash.com/photos/b/download?ixid=b');
  });

  it('rendering and re-rendering a saved Unsplash cover never searches or tracks', () => {
    const src = 'https://images.unsplash.com/a?ixid=a&w=1080';
    const { rerender } = render(<PageCover src={src} coverCredit={{ name: 'Alex Doe', url: 'https://unsplash.com/@a' }} />);
    rerender(<PageCover src={src} coverCredit={{ name: 'Alex Doe', url: 'https://unsplash.com/@a' }} />);

    expect(searchPhotos).not.toHaveBeenCalled();
    expect(trackPhotoDownload).not.toHaveBeenCalled();
  });
});

describe('PageCover — the Unsplash search follows the cover’s layout', () => {
  it.each([
    ['above', 'landscape'],
    ['side', 'portrait'],
  ] as const)('a cover in the %s layout searches for %s photos', async (layout, orientation) => {
    const { container } = render(
      <PageCover src="https://example.com/old.png" layout={layout} onSetCoverImage={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Change cover image'));
    await waitFor(() => expect(container.ownerDocument.querySelectorAll('.image-picker-unsplash__image')).toHaveLength(2));

    expect(searchPhotos).toHaveBeenCalledWith(expect.any(String), expect.any(Number), orientation);
  });
});
