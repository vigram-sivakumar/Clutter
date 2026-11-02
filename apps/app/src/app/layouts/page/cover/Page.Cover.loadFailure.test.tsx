// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@components/toast/ToastProvider';
import { PageCover } from './Page.Cover';

// A cover whose image cannot be loaded is never deleted. Losing the network (or a file) may stop it appearing; it must
// not edit the note. The cover is hidden, a persistent toast says so and offers the way out, and a load that later
// succeeds puts it back by itself.

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
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.useFakeTimers();
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

function renderCover(overrides: Partial<Parameters<typeof PageCover>[0]> = {}) {
  const handlers = {
    onRemove: vi.fn(),
    onHide: vi.fn(),
    onSetCoverImage: vi.fn(),
    onSetCoverImageFromUpload: vi.fn(),
  };
  const utils = render(
    <ToastProvider>
      <PageCover src="https://example.com/cover.jpg" {...handlers} {...overrides} />
    </ToastProvider>
  );

  return { ...utils, ...handlers };
}

const image = () => document.querySelector('img.page-cover__image') as HTMLImageElement;
const toast = () => screen.queryByRole('status');
const fail = () => act(() => void fireEvent.error(image()));

describe('a cover image that fails to load', () => {
  it('is never removed: no onRemove, no onHide, no change to the cover, and its URL and credit are untouched', () => {
    const { onRemove, onHide, onSetCoverImage } = renderCover({ coverCredit: { name: 'Jack Hunter', url: 'https://unsplash.com/@jacktthunter', downloadLocation: 'x' } as never });

    fail();

    expect(onRemove).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
    expect(onSetCoverImage).not.toHaveBeenCalled();
    expect(image().getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('hides the broken image and shows a persistent toast for a remote cover: Retry and Remove', () => {
    renderCover();

    fail();

    expect(image()).toHaveStyle({ visibility: 'hidden' });
    expect(toast()).toHaveTextContent('Unable to load cover image');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('says it is offline when the device is offline', () => {
    setOnline(false);
    renderCover();

    fail();

    expect(toast()).toHaveTextContent('You are offline. Unable to load cover image');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('a local cover offers Change and Remove, never Retry, and never claims to be offline', () => {
    setOnline(false);
    renderCover({ src: 'asset://localhost/Assets/missing.jpg', isLocalImage: true });

    fail();

    expect(toast()).toHaveTextContent('Unable to load cover image');
    expect(toast()).not.toHaveTextContent('offline');
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('the toast cannot be dismissed: it does not time out, and an action does not close it', () => {
    renderCover();
    fail();

    act(() => void vi.advanceTimersByTime(60_000));

    expect(toast()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close|dismiss/i })).toBeNull();
  });

  it('Retry loads the image again and keeps the toast until it loads; a load puts the cover back and clears the toast', () => {
    renderCover();
    fail();
    const failedElement = image();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(image()).not.toBe(failedElement);
    expect(image().getAttribute('src')).toBe('https://example.com/cover.jpg');
    expect(toast()).toBeInTheDocument();

    act(() => void fireEvent.load(image()));

    expect(toast()).toBeNull();
    expect(image()).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('a retry that fails again leaves the cover hidden and the toast up', () => {
    renderCover();
    fail();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fail();

    expect(toast()).toHaveTextContent('Unable to load cover image');
    expect(image()).toHaveStyle({ visibility: 'hidden' });
  });

  it('loads again by itself when the network returns, with no click', () => {
    setOnline(false);
    renderCover();
    fail();
    const failedElement = image();
    expect(toast()).toHaveTextContent('You are offline');

    setOnline(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(image()).not.toBe(failedElement);
    act(() => void fireEvent.load(image()));

    expect(toast()).toBeNull();
    expect(image()).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('does not listen for the network until a remote cover has failed, and stops when it is resolved', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    renderCover();
    expect(add.mock.calls.filter(([type]) => type === 'online')).toHaveLength(0);

    fail();
    expect(add.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);

    act(() => void fireEvent.load(image()));
    expect(remove.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
  });

  it('Remove is the user’s own choice: it calls onRemove, once', () => {
    const { onRemove } = renderCover();
    fail();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('Change opens the cover picker for a local cover', () => {
    const { onRemove } = renderCover({ src: 'asset://localhost/Assets/missing.jpg', isLocalImage: true });
    fail();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    expect(document.querySelector('.image-picker')).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('a cover that cannot be edited (an archived note) offers Retry only for a remote cover, and no Remove', () => {
    renderCover({ editable: false });

    fail();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('a local cover that cannot be edited shows the message with no actions', () => {
    renderCover({ editable: false, src: 'asset://localhost/Assets/missing.jpg', isLocalImage: true });

    fail();

    expect(toast()).toHaveTextContent('Unable to load cover image');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('a different cover is judged on its own: changing the source clears the failure and the toast', () => {
    const handlers = { onRemove: vi.fn(), onSetCoverImage: vi.fn() };
    const { rerender } = render(
      <ToastProvider>
        <PageCover src="https://example.com/a.jpg" {...handlers} />
      </ToastProvider>
    );
    fail();
    expect(toast()).toBeInTheDocument();

    rerender(
      <ToastProvider>
        <PageCover src="https://example.com/b.jpg" {...handlers} />
      </ToastProvider>
    );

    expect(toast()).toBeNull();
    expect(image()).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('leaving the note clears the toast', () => {
    const { unmount } = renderCover();
    fail();
    expect(toast()).toBeInTheDocument();

    unmount();

    expect(document.querySelector('.toast')).toBeNull();
  });

  it('a cover that loads normally shows no toast and stays visible', () => {
    renderCover();

    act(() => void fireEvent.load(image()));

    expect(toast()).toBeNull();
    expect(image()).not.toHaveStyle({ visibility: 'hidden' });
  });
});
