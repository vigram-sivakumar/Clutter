// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnsplashRequestError, type UnsplashFailureKind } from '@core/integrations/unsplash/UnsplashRequestError';
import { ImagePickerLink } from './ImagePicker.Link';
import { ImagePickerUnsplash } from './ImagePicker.Unsplash';
import { unsplashFailureMessage } from './unsplashFailureMessage';

const { searchMock, getPhotoMock } = vi.hoisted(() => ({ searchMock: vi.fn(), getPhotoMock: vi.fn() }));
vi.mock('@core/integrations/unsplash/UnsplashApi', () => ({
  UNSPLASH_SHUFFLE_MAX_PAGE: 10,
  searchPhotos: searchMock,
  getPhoto: getPhotoMock,
  trackPhotoDownload: vi.fn().mockResolvedValue(true),
}));
vi.mock('@shared/helpers/openExternalUrl', () => ({ openExternalUrl: vi.fn() }));

const failure = (kind: UnsplashFailureKind, status?: number) => new UnsplashRequestError(kind, `internal detail for ${kind}`, status);

const SEARCH_COPY: Record<UnsplashFailureKind, string> = {
  'rate-limited': 'Unsplash request limit reached. Wait a few minutes, then try again',
  unreachable: 'Unsplash is temporarily unreachable. Check your connection and try again',
  unavailable: 'Unsplash is temporarily unavailable. Try again in a few minutes',
  'not-configured': 'Unsplash isn’t available right now',
  'not-found': 'Couldn’t load Unsplash images. Try again',
  failed: 'Couldn’t load Unsplash images. Try again',
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('unsplashFailureMessage', () => {
  it.each(Object.entries(SEARCH_COPY) as Array<[UnsplashFailureKind, string]>)('words "%s" for the search picker', (kind, copy) => {
    expect(unsplashFailureMessage(failure(kind), 'search')).toBe(copy);
  });

  it('words the pasted-link picker for what the user was doing', () => {
    expect(unsplashFailureMessage(failure('not-found', 404), 'link')).toBe('Couldn’t find this photo on Unsplash. Check the link and try again');
    expect(unsplashFailureMessage(failure('not-configured'), 'link')).toBe('Unsplash links can’t be added right now. Use an image address instead');
    expect(unsplashFailureMessage(failure('failed', 418), 'link')).toBe('Couldn’t add this photo from Unsplash. Try again');
    // The failures that do not depend on the photo read the same in both pickers.
    for (const kind of ['rate-limited', 'unreachable', 'unavailable'] as const) {
      expect(unsplashFailureMessage(failure(kind), 'link')).toBe(unsplashFailureMessage(failure(kind), 'search'));
    }
  });

  it('gives anything that is not an Unsplash error the neutral failure, and never its text', () => {
    for (const error of [new Error('TypeError: boom with secret-token'), 'plain string secret-token', null, undefined, { message: 'secret-token' }]) {
      const message = unsplashFailureMessage(error, 'search');

      expect(message).toBe(SEARCH_COPY.failed);
      expect(message).not.toContain('secret-token');
    }
  });

  it('follows the writing principles: sentence case, no ending period, typographic apostrophes', () => {
    for (const kind of Object.keys(SEARCH_COPY) as UnsplashFailureKind[]) {
      for (const context of ['search', 'link'] as const) {
        const message = unsplashFailureMessage(failure(kind), context);

        expect(message).not.toMatch(/[.!]$/);
        expect(message).not.toContain("'");
        expect(message).not.toMatch(/Oops|!/);
      }
    }
  });

  it('logs the kind and status for developers, and nothing from the message, the address or what was typed', () => {
    const warn = vi.mocked(console.warn);
    const error = new UnsplashRequestError('rate-limited', 'GET https://proxy.example.test/search/photos?query=private-words failed', 429);

    unsplashFailureMessage(error, 'search');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Unsplash request failed.', { kind: 'rate-limited', status: 429 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-words');
  });
});

describe('the search picker when a request fails', () => {
  it.each([
    ['429', failure('rate-limited', 429), SEARCH_COPY['rate-limited']],
    ['no answer', failure('unreachable'), SEARCH_COPY.unreachable],
    ['502', failure('unavailable', 502), SEARCH_COPY.unavailable],
    ['503', failure('unavailable', 503), SEARCH_COPY.unavailable],
    ['504', failure('unavailable', 504), SEARCH_COPY.unavailable],
    ['an unexpected answer', failure('failed'), SEARCH_COPY.failed],
    ['an error that is not an Unsplash one', new Error('internal stack detail'), SEARCH_COPY.failed],
  ])('shows the message for %s, not the internal error', async (_label, error, copy) => {
    searchMock.mockRejectedValue(error);
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);

    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(container.textContent).not.toContain('internal');
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps showing "Loading images…" while the request is in flight, and recovers when the next search works', async () => {
    searchMock.mockRejectedValueOnce(failure('unreachable'));
    const photo = {
      id: 'p1',
      urls: { small: 'https://images.unsplash.com/p1?w=400', regular: 'https://images.unsplash.com/p1?w=1080' },
      user: { name: 'Alex Doe', links: { html: 'https://unsplash.com/@alex' } },
      links: { downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=x' },
    };
    searchMock.mockResolvedValueOnce([photo]);
    const { container } = render(<ImagePickerUnsplash onSelect={vi.fn()} />);

    await screen.findByText(SEARCH_COPY.unreachable);
    fireEvent.change(container.querySelector('input')!, { target: { value: 'sea' } });

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(screen.queryByText(SEARCH_COPY.unreachable)).toBeNull();
  });
});

describe('the pasted-link picker when a lookup fails', () => {
  const PAGE = 'https://unsplash.com/photos/Dwu85P9SOIk';
  const submit = () => {
    fireEvent.change(screen.getByPlaceholderText('Paste image URL'), { target: { value: PAGE } });
    fireEvent.click(screen.getByText('Add'));
  };

  it.each([
    ['429', failure('rate-limited', 429), SEARCH_COPY['rate-limited']],
    ['no answer', failure('unreachable'), SEARCH_COPY.unreachable],
    ['503', failure('unavailable', 503), SEARCH_COPY.unavailable],
    ['an unknown photo', failure('not-found', 404), 'Couldn’t find this photo on Unsplash. Check the link and try again'],
    ['an unexpected answer', failure('failed'), 'Couldn’t add this photo from Unsplash. Try again'],
    ['an error that is not an Unsplash one', new Error('internal stack detail'), 'Couldn’t add this photo from Unsplash. Try again'],
  ])('shows the message for %s as an alert, sets nothing, and lets the user try again', async (_label, error, copy) => {
    getPhotoMock.mockRejectedValue(error);
    const onSubmit = vi.fn();
    render(<ImagePickerLink onSubmit={onSubmit} />);

    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(copy);
    expect(alert.textContent).not.toContain('internal');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });
});
