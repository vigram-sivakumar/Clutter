// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchPhotos } from '@core/integrations/unsplash/UnsplashApi';
import { CoverAssetsProvider } from '../cover/image-picker/CoverAssetsContext';
import { PageHeaderMoreActionsMenu } from './PageHeaderMoreActionsMenu';
import type { PageHeaderMoreActionsMenuProps } from './PageHeaderMoreActionsMenu';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn().mockResolvedValue('/tmp/photo.png') }));
vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  UNSPLASH_SHUFFLE_MAX_PAGE: 10,
  searchPhotos: vi.fn(),
  trackPhotoDownload: vi.fn().mockResolvedValue(undefined),
}));

const photo = {
  id: 'p1',
  urls: {
    small: 'https://images.unsplash.com/photo-1?ixid=abc&w=400',
    regular: 'https://images.unsplash.com/photo-1?ixid=abc&w=1080',
  },
  user: { name: 'Alex Doe', links: { html: 'https://unsplash.com/@alex' } },
  links: { downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=abc' },
};

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
beforeEach(() => {
  localStorage.clear();
  vi.mocked(searchPhotos).mockResolvedValue([photo]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ASSET = { id: 'a1', name: 'Mountain', previewUrl: 'blob:mountain', cover: 'Assets/mountain.png' };

/** The menu on its cover view, with one local asset on offer and the picker on `source`. */
function openPicker(
  source: 'upload' | 'unsplash',
  onSetCoverImage: PageHeaderMoreActionsMenuProps['onSetCoverImage'] = vi.fn(),
  overrides: Partial<PageHeaderMoreActionsMenuProps> = {}
) {
  localStorage.setItem('clutter-cover-picker-source', source);
  render(
    <CoverAssetsProvider value={() => [ASSET]}>
      <PageHeaderMoreActionsMenu hasCoverImage={false} onSetCoverImage={onSetCoverImage} {...overrides} />
    </CoverAssetsProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByText('Cover image'));
}

const pickerOpen = () => document.querySelector('.image-picker') !== null;
const pickUnsplash = async () => {
  await waitFor(() => expect(document.querySelector('.image-picker img')).not.toBeNull());
  fireEvent.click(document.querySelector('.image-picker img')!.closest('button')!);
};
const pickAsset = () => fireEvent.click(screen.getByLabelText('Mountain'));
const settle = () => act(async () => {});

/** A cover application the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const CREDIT = { name: 'Alex Doe', url: 'https://unsplash.com/@alex', downloadLocation: photo.links.downloadLocation };

describe('PageHeaderMoreActionsMenu — the cover picker closes once the cover is applied', () => {
  it('an Unsplash pick applies the cover, with its credit, and closes the picker', async () => {
    const onSetCoverImage = vi.fn().mockResolvedValue(undefined);
    openPicker('unsplash', onSetCoverImage);

    await pickUnsplash();
    await settle();

    expect(onSetCoverImage).toHaveBeenCalledTimes(1);
    expect(onSetCoverImage).toHaveBeenCalledWith('https://images.unsplash.com/photo-1?ixid=abc&w=3200', CREDIT);
    expect(pickerOpen()).toBe(false);
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a local asset pick applies the cover and closes the picker', async () => {
    const onSetCoverImage = vi.fn().mockResolvedValue(undefined);
    openPicker('upload', onSetCoverImage);

    pickAsset();
    await settle();

    expect(onSetCoverImage).toHaveBeenCalledWith('Assets/mountain.png');
    expect(pickerOpen()).toBe(false);
  });

  it('an uploaded image applies the cover and closes the picker', async () => {
    const onSetCoverImageFromUpload = vi.fn().mockResolvedValue(true);
    openPicker('upload', vi.fn(), { onSetCoverImageFromUpload });

    fireEvent.click(screen.getByText('Upload'));
    await settle();

    expect(onSetCoverImageFromUpload).toHaveBeenCalledWith('/tmp/photo.png');
    expect(pickerOpen()).toBe(false);
  });

  it('an upload that fails (reported by its handler as false) leaves the picker open', async () => {
    openPicker('upload', vi.fn(), { onSetCoverImageFromUpload: vi.fn().mockResolvedValue(false) });

    fireEvent.click(screen.getByText('Upload'));
    await settle();

    expect(pickerOpen()).toBe(true);
  });

  it('a handler that applies synchronously closes it at once', () => {
    openPicker('upload', vi.fn());

    pickAsset();

    expect(pickerOpen()).toBe(false);
  });

  it('stays open while the cover is still being applied, and closes only when it is', async () => {
    const applying = deferred<void>();
    openPicker('unsplash', vi.fn().mockReturnValue(applying.promise));

    await pickUnsplash();
    await settle();
    expect(pickerOpen()).toBe(true);

    applying.resolve();
    await settle();

    expect(pickerOpen()).toBe(false);
  });

  it('ignores a second pick while one is being applied, so the cover is applied once', async () => {
    const applying = deferred<void>();
    const onSetCoverImage = vi.fn().mockReturnValue(applying.promise);
    openPicker('upload', onSetCoverImage);

    pickAsset();
    pickAsset();
    applying.resolve();
    await settle();

    expect(onSetCoverImage).toHaveBeenCalledTimes(1);
  });

  it('applies a later pick normally once an earlier one has finished', async () => {
    const onSetCoverImage = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValue(undefined);
    openPicker('upload', onSetCoverImage);

    pickAsset();
    await settle();
    expect(pickerOpen()).toBe(true);

    pickAsset();
    await settle();

    expect(onSetCoverImage).toHaveBeenCalledTimes(2);
    expect(pickerOpen()).toBe(false);
  });
});

describe('PageHeaderMoreActionsMenu — a failed cover application is not treated as a success', () => {
  it('a rejected application leaves the picker open, for any source', async () => {
    const onSetCoverImage = vi.fn().mockRejectedValue(new Error('write failed'));
    openPicker('unsplash', onSetCoverImage);

    await pickUnsplash();
    await settle();

    expect(onSetCoverImage).toHaveBeenCalledTimes(1);
    expect(pickerOpen()).toBe(true);
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('an application that reports false (already reported to the user) leaves the picker open', async () => {
    openPicker('upload', vi.fn().mockResolvedValue(false));

    pickAsset();
    await settle();

    expect(pickerOpen()).toBe(true);
  });

  it('a handler that reports false synchronously (nothing to apply it to) leaves the picker open', async () => {
    openPicker('upload', vi.fn().mockReturnValue(false));

    pickAsset();
    await settle();

    expect(pickerOpen()).toBe(true);
  });
});
