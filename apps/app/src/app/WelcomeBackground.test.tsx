// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchPhotos = vi.hoisted(() => vi.fn());
const trackPhotoDownload = vi.hoisted(() => vi.fn());
vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  searchPhotos: (...args: unknown[]) => searchPhotos(...args),
  trackPhotoDownload: (...args: unknown[]) => trackPhotoDownload(...args),
}));

import { WelcomeBackground } from './WelcomeBackground';

const PHOTO = {
  id: 'p1',
  urls: {
    small: 'https://images.unsplash.com/p1-small',
    regular: 'https://images.unsplash.com/p1',
  },
  user: { name: 'Ada Lovelace', links: { html: 'https://unsplash.com/@ada' } },
  links: {
    downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=abc',
  },
};

const frame = () => document.querySelector('.startup-frame') as HTMLElement;

beforeEach(() => {
  searchPhotos.mockReset();
  trackPhotoDownload.mockReset().mockResolvedValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(cleanup);

describe('WelcomeBackground', () => {
  it('shows a random artwork behind the dialog, credited with the existing cover credit', async () => {
    searchPhotos.mockResolvedValue([PHOTO]);
    render(<WelcomeBackground />);

    await waitFor(() =>
      expect(frame()).toHaveAttribute('data-backdrop', 'image')
    );
    expect(frame().style.backgroundImage).toContain(
      'https://images.unsplash.com/p1'
    );
    const credit = screen.getByRole('link', {
      name: 'Ada Lovelace on Unsplash',
    });
    expect(credit).toHaveAttribute(
      'href',
      'https://unsplash.com/@ada?utm_source=clutter&utm_medium=referral'
    );
    expect(
      document.querySelector('.cover-attribution.welcome-background__credit')
    ).not.toBeNull();
  });

  it('searches only the Welcome list, within its first few pages', async () => {
    searchPhotos.mockResolvedValue([PHOTO]);
    for (let i = 0; i < 20; i++) {
      render(<WelcomeBackground />);
      cleanup();
    }

    expect(searchPhotos).toHaveBeenCalledTimes(20);
    for (const [query, page, orientation] of searchPhotos.mock.calls) {
      expect(orientation).toBe('landscape'); // the Welcome frame is a wide window
      expect(typeof query).toBe('string');
      expect(query.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(page);
    }
  });

  it('reports the shown photo to Unsplash once, with its exact download location', async () => {
    searchPhotos.mockResolvedValue([PHOTO]);
    render(<WelcomeBackground />);

    await waitFor(() => expect(trackPhotoDownload).toHaveBeenCalledTimes(1));
    expect(trackPhotoDownload).toHaveBeenCalledWith(
      PHOTO.links.downloadLocation
    );
  });

  it('is the plain themed surface, with no credit, until a photo has loaded', async () => {
    let resolve!: (photos: unknown[]) => void;
    searchPhotos.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<WelcomeBackground />);

    // not even the backup, until the search has answered
    expect(frame()).not.toHaveAttribute('data-backdrop');
    expect(document.querySelector('.cover-attribution')).toBeNull();

    await act(async () => resolve([PHOTO]));
    expect(frame()).toHaveAttribute('data-backdrop', 'image');
  });

  it.each([
    [
      'the request fails (offline, no key)',
      () =>
        searchPhotos.mockRejectedValue(
          new Error('Unsplash is not configured.')
        ),
    ],
    ['the search finds nothing', () => searchPhotos.mockResolvedValue([])],
  ])(
    'falls back to the fixed backup image, credited "by Unsplash", with no tracking, when %s',
    async (_what, arrange) => {
      arrange();
      render(<WelcomeBackground />);

      await waitFor(() =>
        expect(frame()).toHaveAttribute('data-backdrop', 'image')
      );
      expect(frame().style.backgroundImage).toContain(
        'photo-1635776062360-af423602aff3'
      );
      expect(document.querySelector('.cover-attribution')).toHaveTextContent(
        'by Unsplash'
      );
      expect(trackPhotoDownload).not.toHaveBeenCalled();
    }
  );

  it('ignores a result that arrives after it was unmounted', async () => {
    let resolve!: (photos: unknown[]) => void;
    searchPhotos.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<WelcomeBackground />);
    unmount();

    await act(async () => resolve([PHOTO]));

    expect(trackPhotoDownload).not.toHaveBeenCalled();
  });
});
