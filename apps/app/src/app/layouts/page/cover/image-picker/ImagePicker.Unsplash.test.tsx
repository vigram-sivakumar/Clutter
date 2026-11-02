// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ImagePickerUnsplash } from './ImagePicker.Unsplash';
import { listEditorialPhotos, searchPhotos, trackPhotoDownload } from '@core/integrations/unsplash/UnsplashApi';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';

vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  UNSPLASH_SHUFFLE_MAX_PAGE: 11,
  listEditorialPhotos: vi.fn(),
  searchPhotos: vi.fn(),
  trackPhotoDownload: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@shared/helpers/openExternalUrl', () => ({
  openExternalUrl: vi.fn(),
}));

const photo = {
  id: 'p1',
  urls: {
    small: 'https://images.unsplash.com/photo-1?ixid=abc&w=400',
    regular: 'https://images.unsplash.com/photo-1?ixid=abc&w=1080',
  },
  user: { name: 'Alex Doe', links: { html: 'https://unsplash.com/@alex' } },
  links: {
    downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=abc',
  },
};

describe('ImagePickerUnsplash', () => {
  beforeEach(() => {
    vi.mocked(listEditorialPhotos).mockResolvedValue([photo, { ...photo, id: 'p2' }]);
    vi.mocked(searchPhotos).mockResolvedValue([photo, { ...photo, id: 'p2' }]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('hotlinks the API-returned small URL for thumbnails', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')?.getAttribute('src')).toBe(photo.urls.small);
  });

  it('links the photographer and Unsplash with referral parameters', async () => {
    render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    const photographer = (await screen.findAllByText('Alex Doe'))[0]!;
    expect(photographer.getAttribute('href')).toBe(
      'https://unsplash.com/@alex?utm_source=clutter&utm_medium=referral'
    );
    const unsplash = screen.getByText('Unsplash', { selector: 'a' });
    expect(unsplash.getAttribute('href')).toBe(
      'https://unsplash.com?utm_source=clutter&utm_medium=referral'
    );
    fireEvent.click(photographer);
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://unsplash.com/@alex?utm_source=clutter&utm_medium=referral'
    );
  });

  it('selecting a photo sets its URL at the cover width, otherwise as returned, and tracks download_location', async () => {
    const onSelect = vi.fn();
    const { container } = render(<ImagePickerUnsplash onSelect={onSelect} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    expect(trackPhotoDownload).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('img')!.closest('button')!);

    expect(onSelect).toHaveBeenCalledWith('https://images.unsplash.com/photo-1?ixid=abc&w=4800', {
      name: 'Alex Doe',
      url: 'https://unsplash.com/@alex',
      downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=abc',
    });
    expect(trackPhotoDownload).toHaveBeenCalledWith(photo.links.downloadLocation);
  });

  it('does not track while browsing: opening, searching and shuffling only browse', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: 'books' } });
    await waitFor(() => expect(searchPhotos).toHaveBeenCalledWith('books', 1, undefined));
    fireEvent.click(await screen.findByLabelText('Shuffle'));
    fireEvent.mouseEnter(container.querySelector('img')!);

    expect(trackPhotoDownload).not.toHaveBeenCalled();
  });

  it('tracks again when a second photo replaces the first', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelectorAll('img').length).toBe(2));
    const imgs = container.querySelectorAll('img');
    fireEvent.click(imgs[0]!.closest('button')!);
    fireEvent.click(imgs[1]!.closest('button')!);
    expect(trackPhotoDownload).toHaveBeenCalledTimes(2);
  });
});

describe('ImagePickerUnsplash default feed', () => {
  beforeEach(() => {
    vi.mocked(listEditorialPhotos).mockResolvedValue([photo]);
    vi.mocked(searchPhotos).mockResolvedValue([{ ...photo, id: 'found' }]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens on a random page of the Editorial feed (1 to 11), and does not search', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
    expect(listEditorialPhotos).toHaveBeenCalledWith(6);
    expect(searchPhotos).not.toHaveBeenCalled();
    vi.mocked(Math.random).mockRestore();
  });

  it('searches when text is typed, and returns to the Editorial feed when the search is cleared', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const input = screen.getByPlaceholderText('Search Unsplash');

    fireEvent.change(input, { target: { value: 'books' } });
    await waitFor(() => expect(searchPhotos).toHaveBeenCalledWith('books', 1, undefined));
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(listEditorialPhotos).toHaveBeenCalledTimes(2));
    expect(listEditorialPhotos).toHaveBeenLastCalledWith(expect.any(Number));
  });

  it('treats a blank search as the Editorial feed', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: '   ' } });
    await waitFor(() => expect(listEditorialPhotos).toHaveBeenCalledTimes(2));
    expect(searchPhotos).not.toHaveBeenCalled();
  });

  it('Shuffle loads another random Editorial page (1 to 10) and not a search', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    fireEvent.click(screen.getByLabelText('Shuffle'));

    await waitFor(() => expect(listEditorialPhotos).toHaveBeenLastCalledWith(7));
    expect(searchPhotos).not.toHaveBeenCalled();
    vi.mocked(Math.random).mockRestore();
  });

  it('Shuffle on a search loads a random page of that search', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: 'books' } });
    fireEvent.click(await screen.findByLabelText('Shuffle'));

    await waitFor(() => expect(searchPhotos).toHaveBeenLastCalledWith('books', 3, undefined));
    vi.mocked(Math.random).mockRestore();
  });

  it('shows the error, and then the empty state, as before', async () => {
    vi.mocked(listEditorialPhotos).mockRejectedValueOnce(new Error('boom'));
    render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading images…')).toBeNull());
    expect(screen.queryByLabelText('Shuffle')).toBeNull();

    cleanup();
    vi.mocked(listEditorialPhotos).mockResolvedValueOnce([]);
    render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    expect(await screen.findByText('No images found')).toBeTruthy();
  });
});

describe('ImagePickerUnsplash orientation', () => {
  beforeEach(() => {
    vi.mocked(listEditorialPhotos).mockResolvedValue([photo]);
    vi.mocked(searchPhotos).mockResolvedValue([photo]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function searchFor(text: string) {
    await waitFor(() => expect(listEditorialPhotos).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: text } });
    await waitFor(() => expect(searchPhotos).toHaveBeenCalled());
  }

  it.each(['landscape', 'portrait', 'squarish'] as const)('searches for %s photos when asked to', async (orientation) => {
    render(<ImagePickerUnsplash onSelect={vi.fn()} orientation={orientation} />);
    await searchFor('books');

    expect(vi.mocked(searchPhotos).mock.calls.every(([, , shape]) => shape === orientation)).toBe(true);
  });

  it('leaves the shape to the API’s default (portrait) when not given one', async () => {
    render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await searchFor('books');

    expect(vi.mocked(searchPhotos).mock.calls.every(([, , shape]) => shape === undefined)).toBe(true);
  });

  it('searches again, for the new shape, when the orientation changes', async () => {
    const { rerender } = render(<ImagePickerUnsplash onSelect={vi.fn()} orientation="portrait" />);
    await searchFor('books');
    const calls = vi.mocked(searchPhotos).mock.calls.length;

    rerender(<ImagePickerUnsplash onSelect={vi.fn()} orientation="landscape" />);

    await waitFor(() => expect(searchPhotos).toHaveBeenCalledTimes(calls + 1));
    expect(searchPhotos).toHaveBeenLastCalledWith('books', expect.any(Number), 'landscape');
  });

  it('does not reload the Editorial feed when the orientation changes: the feed has no shape', async () => {
    const { rerender } = render(<ImagePickerUnsplash onSelect={vi.fn()} orientation="portrait" />);
    await waitFor(() => expect(listEditorialPhotos).toHaveBeenCalledTimes(1));

    rerender(<ImagePickerUnsplash onSelect={vi.fn()} orientation="landscape" />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
  });
});
