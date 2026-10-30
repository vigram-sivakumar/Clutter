// @vitest-environment jsdom

import { cleanup, render, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImagePickerLink } from './ImagePicker.Link';

const { getPhotoMock, trackMock } = vi.hoisted(() => ({ getPhotoMock: vi.fn(), trackMock: vi.fn() }));
vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  getPhoto: getPhotoMock,
  trackPhotoDownload: trackMock,
}));

let created: HTMLImageElement[] = [];
const OriginalImage = window.Image;

beforeEach(() => {
  created = [];
  vi.stubGlobal(
    'Image',
    function (this: unknown, ...args: [number?, number?]) {
      const img = new OriginalImage(...args);
      created.push(img);
      return img;
    } as unknown as typeof Image
  );
});

afterEach(() => {
  // Restore only Image, not vi.unstubAllGlobals() — narrower and safer
  // if this file ever gains another global stub alongside this one.
  vi.stubGlobal('Image', OriginalImage);
  cleanup();
});

function fillAndSubmit(url: string) {
  fireEvent.change(screen.getByPlaceholderText('Paste image URL'), {
    target: { value: url },
  });
  fireEvent.click(screen.getByText(/^Add$|^Adding…$/));
}

describe('ImagePickerLink — URL syntax validation', () => {
  it('rejects an obviously invalid URL without ever probing an image', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('not a url');

    expect(created).toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/valid web address/i);
    // Picker itself has nothing to "close" at this layer — the input is
    // still present and usable, confirming nothing dismissed it.
    expect(screen.getByPlaceholderText('Paste image URL')).toBeDefined();
  });

  it('rejects a non-http(s) scheme (e.g. javascript:) without probing an image', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('javascript:alert(1)');

    expect(created).toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();
  });
});

describe('ImagePickerLink — image load validation', () => {
  it('does not call onSubmit until the image actually finishes loading', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/cover.png');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
  });

  it('calls onSubmit with the URL once the image loads successfully', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/cover.png');
    fireEvent.load(created[0]!);

    expect(onSubmit).toHaveBeenCalledWith('https://example.com/cover.png');
  });

  it('shows an inline error and never calls onSubmit when the image fails to load', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/not-an-image.html');
    fireEvent.error(created[0]!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/couldn.t load/i);
    expect(screen.getByPlaceholderText('Paste image URL')).toBeDefined();
  });

  it('lets the user correct the URL after a failure — editing the field clears the error', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/broken.png');
    fireEvent.error(created[0]!);
    expect(screen.getByRole('alert')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Paste image URL'), {
      target: { value: 'https://example.com/broken.png2' },
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ImagePickerLink — pending/duplicate-submission UX', () => {
  it('disables Add and shows a pending label while a check is in flight', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/cover.png');

    const button = screen.getByText('Adding…').closest('button')!;
    expect(button.disabled).toBe(true);
  });

  it('a disabled Add button cannot start a second probe while one is pending', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/cover.png');
    expect(created).toHaveLength(1);

    // The button is disabled now; a further click must not create a
    // second in-flight probe.
    fireEvent.click(screen.getByText('Adding…'));
    expect(created).toHaveLength(1);
  });

  it('re-enables Add with its normal label once the check resolves', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://example.com/broken.png');
    fireEvent.error(created[0]!);

    const button = screen.getByText('Add').closest('button')!;
    expect(button.disabled).toBe(false);
  });
});

describe('ImagePickerLink — Unsplash photo page links (resolved through the API)', () => {
  const PAGE = 'https://unsplash.com/photos/a-person-on-a-beach-Dwu85P9SOIk';
  const photo = {
    id: 'Dwu85P9SOIk',
    urls: { small: 'https://images.unsplash.com/s.jpg', regular: 'https://images.unsplash.com/r.jpg?w=1080' },
    user: { name: 'Alex Doe', links: { html: 'https://unsplash.com/@alex' } },
    links: { downloadLocation: 'https://api.unsplash.com/photos/Dwu85P9SOIk/download?ixid=abc' },
  };

  beforeEach(() => {
    getPhotoMock.mockReset();
    trackMock.mockReset();
  });

  it('sets the API picture as the cover with the photographer, reports the download, and probes no image', async () => {
    getPhotoMock.mockResolvedValue(photo);
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit(PAGE);

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(getPhotoMock).toHaveBeenCalledWith('Dwu85P9SOIk');
    expect(onSubmit).toHaveBeenCalledWith('https://images.unsplash.com/r.jpg?w=3200', {
      name: 'Alex Doe',
      url: 'https://unsplash.com/@alex',
      downloadLocation: photo.links.downloadLocation,
    });
    expect(trackMock).toHaveBeenCalledWith(photo.links.downloadLocation);
    expect(created).toHaveLength(0);
  });

  it('shows an error and sets nothing when Unsplash does not know the photo', async () => {
    getPhotoMock.mockRejectedValue(new Error('Unsplash request failed (404).'));
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit(PAGE);

    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn.t find this photo on unsplash/i);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('says so, instead of failing silently, when Unsplash is not configured', async () => {
    getPhotoMock.mockRejectedValue(new Error('Unsplash is not configured.'));
    render(<ImagePickerLink onSubmit={vi.fn()} />);

    fillAndSubmit(PAGE);

    expect((await screen.findByRole('alert')).textContent).toMatch(/can.t be added right now/i);
  });

  it('saves a pasted Unsplash image address at the cover width, after the ordinary image check, with no API lookup', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://images.unsplash.com/photo-1560506287-e7dab1f13a0d?q=80&w=1080');
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.load(created[0]!);

    expect(getPhotoMock).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith('https://images.unsplash.com/photo-1560506287-e7dab1f13a0d?q=80&w=3200');
  });

  it('keeps a pasted Unsplash address that already asks for a larger width', () => {
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    fillAndSubmit('https://images.unsplash.com/photo-1?q=80&w=4800');
    fireEvent.load(created[0]!);

    expect(onSubmit).toHaveBeenCalledWith('https://images.unsplash.com/photo-1?q=80&w=4800');
  });
});
