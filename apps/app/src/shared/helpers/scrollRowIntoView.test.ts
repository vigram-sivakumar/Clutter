// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollRowIntoView } from './scrollRowIntoView';

function makeScrollableContainer(): HTMLDivElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 300,
    left: 0,
    right: 100,
    width: 100,
    height: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(container);
  return container;
}

function appendRow(container: HTMLDivElement, rect: Partial<DOMRect>): HTMLDivElement {
  const row = document.createElement('div');
  container.appendChild(row);
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  });
  row.scrollIntoView = vi.fn();
  return row;
}

function mockOverflowAuto(container: HTMLElement): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    if (el === container) {
      return { overflowY: 'auto' } as CSSStyleDeclaration;
    }
    return { overflowY: 'visible' } as CSSStyleDeclaration;
  });
}

function mockReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('scrollRowIntoView', () => {
  it('does nothing when the row is already fully visible within its scroll parent', () => {
    const container = makeScrollableContainer();
    mockOverflowAuto(container);
    mockReducedMotion(false);
    const row = appendRow(container, { top: 50, bottom: 100 });

    scrollRowIntoView(row);

    expect(row.scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls smoothly, centered, when the row is outside the visible area and motion is not reduced', () => {
    const container = makeScrollableContainer();
    mockOverflowAuto(container);
    mockReducedMotion(false);
    const row = appendRow(container, { top: 400, bottom: 450 });

    scrollRowIntoView(row);

    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('scrolls instantly (no animation) when prefers-reduced-motion is set', () => {
    const container = makeScrollableContainer();
    mockOverflowAuto(container);
    mockReducedMotion(true);
    const row = appendRow(container, { top: 400, bottom: 450 });

    scrollRowIntoView(row);

    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('still scrolls (treats as not-yet-visible) when no scrolling ancestor is found', () => {
    const row = document.createElement('div');
    document.body.appendChild(row);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    row.scrollIntoView = vi.fn();
    mockReducedMotion(false);

    scrollRowIntoView(row);

    expect(row.scrollIntoView).toHaveBeenCalled();
  });
});
