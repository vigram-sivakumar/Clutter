// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listEditorialPhotos } from '@core/integrations/unsplash/UnsplashApi';
import { ImagePickerUnsplash } from './ImagePicker.Unsplash';

vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  UNSPLASH_SHUFFLE_MAX_PAGE: 11,
  listEditorialPhotos: vi.fn(),
  searchPhotos: vi.fn(),
  trackPhotoDownload: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));

// A thumbnail that does not load is replaced by a placeholder, so a broken-image icon is never left.

const photoNamed = (id: string) => ({
  id,
  urls: { small: `https://images.unsplash.com/${id}?ixid=x&w=400`, regular: `https://images.unsplash.com/${id}?ixid=x&w=1080` },
  user: { name: `Person ${id}`, links: { html: 'https://unsplash.com/@someone' } },
  links: { downloadLocation: `https://api.unsplash.com/photos/${id}/download?ixid=x` },
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(listEditorialPhotos).mockResolvedValue(['a', 'b'].map(photoNamed));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const thumbnails = (container: HTMLElement) => container.querySelectorAll('img.image-picker-unsplash__image');
const placeholders = (container: HTMLElement) => container.querySelectorAll('.image-picker-unsplash__placeholder');

describe('a thumbnail that does not load', () => {
  it('is replaced by a placeholder, with no broken-image icon', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(thumbnails(container)).toHaveLength(2));

    fireEvent.error(thumbnails(container)[0]!);

    expect(thumbnails(container)).toHaveLength(1);
    expect(placeholders(container)).toHaveLength(1);
    expect(placeholders(container)[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps its credit and the other photos, and the tile is still pickable', async () => {
    const onSelect = vi.fn();
    const { container } = render(<ImagePickerUnsplash onSelect={onSelect} />);
    await waitFor(() => expect(thumbnails(container)).toHaveLength(2));

    fireEvent.error(thumbnails(container)[0]!);

    expect(screen.getByText('Person a')).toBeInTheDocument();
    expect(screen.getByText('Person b')).toBeInTheDocument();
    fireEvent.click(placeholders(container)[0]!.closest('button')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
