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

// The Editorial photos are saved in localStorage: every test starts without them, as a first-ever opening.
beforeEach(() => localStorage.clear());

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
    // Back to the saved Editorial photos: no new request.
    await waitFor(() => expect(screen.getAllByText('Alex Doe').length).toBeGreaterThan(0));
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
  });

  it('treats a blank search as the Editorial feed', async () => {
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: '   ' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
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

const photosNamed = (...ids: string[]) => ids.map((id) => ({ ...photo, id, links: { downloadLocation: `https://api.unsplash.com/photos/${id}/download?ixid=abc` } }));
const shownIds = (container: HTMLElement) => [...container.querySelectorAll('.image-picker-unsplash__card .image-picker-unsplash__image')].length;

describe('ImagePickerUnsplash saved Editorial photos', () => {
  beforeEach(() => {
    vi.mocked(listEditorialPhotos).mockResolvedValue(photosNamed('a', 'b', 'c'));
    vi.mocked(searchPhotos).mockResolvedValue(photosNamed('found'));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function open() {
    const view = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(view.container.querySelector('img')).not.toBeNull());

    return view;
  }

  it('acceptance: ten openings across different notes make no Editorial request after the first', async () => {
    for (let opening = 0; opening < 10; opening += 1) {
      const { container, unmount } = await open();
      expect(shownIds(container)).toBe(3);
      unmount();
    }

    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
  });

  it('shows the saved photos at once on a later opening, with no loading state and no request', async () => {
    await (await open()).unmount();
    vi.clearAllMocks();

    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);

    expect(screen.queryByText('Loading images…')).toBeNull();
    expect(shownIds(container)).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listEditorialPhotos).not.toHaveBeenCalled();
  });

  it('keeps the saved photos across a restart (a fresh load of the app reads them back from storage)', async () => {
    await (await open()).unmount();
    expect(JSON.parse(localStorage.getItem('clutter-unsplash-editorial')!)).toHaveLength(3);

    vi.resetModules();
    const fresh = await import('@core/integrations/unsplash/editorialCache');

    expect(fresh.readEditorialCache()?.map((saved) => saved.id)).toEqual(['a', 'b', 'c']);
  });

  it('Shuffle is the only thing that fetches again, and replaces the saved photos when it succeeds', async () => {
    await (await open()).unmount();
    vi.mocked(listEditorialPhotos).mockResolvedValue(photosNamed('x', 'y'));
    const { container } = await open();
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Shuffle'));

    await waitFor(() => expect(shownIds(container)).toBe(2));
    expect(listEditorialPhotos).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem('clutter-unsplash-editorial')!).map((saved: { id: string }) => saved.id)).toEqual(['x', 'y']);

    cleanup();
    const reopened = await open();
    expect(shownIds(reopened.container)).toBe(2);
    expect(listEditorialPhotos).toHaveBeenCalledTimes(2);
  });

  it('a failed Shuffle leaves the saved photos in place, and the next opening shows them', async () => {
    await (await open()).unmount();
    vi.mocked(listEditorialPhotos).mockRejectedValueOnce(new Error('offline'));
    const { container } = await open();

    fireEvent.click(screen.getByLabelText('Shuffle'));

    await waitFor(() => expect(container.querySelector('.image-picker-unsplash__state')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('clutter-unsplash-editorial')!)).toHaveLength(3);

    cleanup();
    const reopened = await open();
    expect(shownIds(reopened.container)).toBe(3);
    expect(listEditorialPhotos).toHaveBeenCalledTimes(2);
  });

  it('a search does not touch the saved photos, and clearing it shows them again without a request', async () => {
    const { container } = await open();
    const input = screen.getByPlaceholderText('Search Unsplash');

    fireEvent.change(input, { target: { value: 'books' } });
    await waitFor(() => expect(searchPhotos).toHaveBeenCalledWith('books', 1, undefined));
    await waitFor(() => expect(shownIds(container)).toBe(1));
    expect(JSON.parse(localStorage.getItem('clutter-unsplash-editorial')!)).toHaveLength(3);

    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => expect(shownIds(container)).toBe(3));
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
  });

  it('Shuffle during a search shuffles the search, not the saved photos', async () => {
    const { container } = await open();
    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: 'books' } });
    await waitFor(() => expect(shownIds(container)).toBe(1));
    fireEvent.click(screen.getByLabelText('Shuffle'));
    await waitFor(() => expect(searchPhotos).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByPlaceholderText('Search Unsplash'), { target: { value: '' } });

    await waitFor(() => expect(shownIds(container)).toBe(3));
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not JSON', 'not json{'],
    ['not a list', '{"a":1}'],
    ['an empty list', '[]'],
    ['photos missing fields', '[{"id":"p"}]'],
    ['an image from another host', JSON.stringify([{ ...photo, urls: { small: 'https://evil.example/x.jpg', regular: photo.urls.regular } }])],
    ['a profile link that is not https', JSON.stringify([{ ...photo, user: { name: 'A', links: { html: 'javascript:alert(1)' } } }])],
  ])('treats %s in storage as no cache: it fetches once and saves a good copy', async (_label, stored) => {
    localStorage.setItem('clutter-unsplash-editorial', stored);

    const { container } = await open();

    expect(shownIds(container)).toBe(3);
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('clutter-unsplash-editorial')!)).toHaveLength(3);
  });

  it('pickers opening together share one request', async () => {
    const first = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    const second = render(<ImagePickerUnsplash onSelect={vi.fn()} />);

    await waitFor(() => expect(first.container.querySelector('img')).not.toBeNull());
    await waitFor(() => expect(second.container.querySelector('img')).not.toBeNull());
    expect(listEditorialPhotos).toHaveBeenCalledTimes(1);
  });

  it('offline: the first opening shows the error and saves nothing, and the saved photos show once they exist', async () => {
    vi.mocked(listEditorialPhotos).mockRejectedValueOnce(new Error('offline'));
    const first = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    await waitFor(() => expect(first.container.querySelector('.image-picker-unsplash__state')).not.toBeNull());
    expect(localStorage.getItem('clutter-unsplash-editorial')).toBeNull();
    first.unmount();

    const second = await open();
    expect(shownIds(second.container)).toBe(3);
    second.unmount();

    vi.mocked(listEditorialPhotos).mockRejectedValue(new Error('offline'));
    const third = render(<ImagePickerUnsplash onSelect={vi.fn()} />);
    expect(shownIds(third.container)).toBe(3);
  });

  it('selecting a saved photo still credits and tracks it', async () => {
    const onSelect = vi.fn();
    await (await open()).unmount();
    const { container } = render(<ImagePickerUnsplash onSelect={onSelect} />);

    fireEvent.click(container.querySelector('img')!.closest('button')!);

    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining('w=4800'), expect.objectContaining({ name: 'Alex Doe' }));
    expect(trackPhotoDownload).toHaveBeenCalledWith('https://api.unsplash.com/photos/a/download?ixid=abc');
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
