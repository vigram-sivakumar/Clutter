// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@components/toast/ToastProvider';
import { PageCover } from './Page.Cover';

// A cover whose image fails to load gives its space back to the page: no empty container, no blank area and no
// broken-image icon. The cover itself is not removed (see Page.Cover.loadFailure.test.tsx), and a later load puts it
// back. jsdom applies no stylesheets, so the collapse itself is pinned in the CSS text below.

const observers: Array<() => void> = [];
class ResizeObserverMock {
  constructor(callback: () => void) {
    observers.push(callback);
  }
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
  observers.length = 0;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderCover = (props: Partial<Parameters<typeof PageCover>[0]> = {}) =>
  render(
    <ToastProvider>
      <PageCover src="https://example.com/cover.jpg" onRemove={vi.fn()} onSetCoverImage={vi.fn()} {...props} />
    </ToastProvider>
  );

const cover = () => document.querySelector('aside.page__cover') as HTMLElement;
const image = () => document.querySelector('img.page-cover__image') as HTMLImageElement;
const fail = () => act(() => void fireEvent.error(image()));

describe('a cover image that fails to load', () => {
  it('marks the cover as failed so the page can take its space back, and never shows the image', () => {
    renderCover();
    expect(cover()).not.toHaveAttribute('data-load-failed');

    fail();

    expect(cover()).toHaveAttribute('data-load-failed');
    expect(image()).toHaveStyle({ visibility: 'hidden' });
  });

  it('keeps the image mounted, with its address, so a later load can bring the cover back', () => {
    renderCover();

    fail();

    expect(image()).toBeInTheDocument();
    expect(image().getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('puts the cover back, and clears the failed mark, when the image does load', () => {
    renderCover();
    fail();

    act(() => void fireEvent.load(image()));

    expect(cover()).not.toHaveAttribute('data-load-failed');
    expect(image()).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('still offers Retry and Remove, which do not depend on the cover being on screen', () => {
    const onRemove = vi.fn();
    renderCover({ onRemove });

    fail();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a cover that loads is not marked, including one served from the WebView cache (a load, never an error)', () => {
    renderCover();

    act(() => void fireEvent.load(image()));

    expect(cover()).not.toHaveAttribute('data-load-failed');
    expect(image()).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('does not record the collapsed width as the cover’s settled width', () => {
    renderCover();
    const rect = (width: number) =>
      vi.spyOn(cover(), 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
    const resized = () => act(() => observers.forEach((notify) => notify()));

    rect(320);
    resized();
    expect(cover().style.getPropertyValue('--page-cover-natural-width')).toBe('320px');

    fail();
    rect(0);
    resized();

    expect(cover().style.getPropertyValue('--page-cover-natural-width')).toBe('320px');
  });
});

describe('the collapse itself (Page.Cover.css)', () => {
  const css = readFileSync(join(__dirname, 'Page.Cover.css'), 'utf8');
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} rule`).toBeGreaterThan(-1);

    return css.slice(start, css.indexOf('}', start));
  };

  it('Side: the failed cover reserves no width, margin or floor, like a hidden one', () => {
    const body = rule('.page__cover[data-load-failed]');

    expect(body).toMatch(/flex-grow:\s*0/);
    expect(body).toMatch(/flex-basis:\s*0/);
    expect(body).toMatch(/min-width:\s*0/);
    expect(body).toMatch(/margin-left:\s*0/);
  });

  it('Above: the failed cover leaves layout entirely, so no gap or empty box is left above the title', () => {
    expect(rule('.page__content > .page__cover[data-load-failed]')).toMatch(/display:\s*none/);
  });

  it('no quiet placeholder surface is painted for a failed cover', () => {
    expect(rule('.page__cover[data-load-failed]')).not.toMatch(/background/);
    expect(rule('.page__content > .page__cover[data-load-failed]')).not.toMatch(/background/);
  });
});
