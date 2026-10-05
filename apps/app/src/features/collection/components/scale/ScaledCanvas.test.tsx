// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScaledCanvas } from './ScaledCanvas';

let width = 300;
let height = 500;
let clientWidth: PropertyDescriptor | undefined;
let offsetHeight: PropertyDescriptor | undefined;

beforeEach(() => {
  clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const [key, descriptor] of [
    ['clientWidth', clientWidth],
    ['offsetHeight', offsetHeight],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
  width = 300;
  height = 500;
});

describe('ScaledCanvas', () => {
  it('lays its children out at the canonical design width', () => {
    render(
      <ScaledCanvas designWidth={600}>
        <p data-testid="child">hi</p>
      </ScaledCanvas>
    );

    const canvas = screen.getByTestId('child').parentElement as HTMLElement;
    expect(canvas).toHaveClass('scaled-canvas__canvas');
    expect(canvas.style.width).toBe('600px');
  });

  it('scales to (available width / design width), as a plain number', () => {
    render(
      <ScaledCanvas designWidth={600}>
        <p data-testid="child">hi</p>
      </ScaledCanvas>
    );
    const canvas = screen.getByTestId('child').parentElement as HTMLElement;

    expect(canvas.style.getPropertyValue('--scaled-canvas-scale')).toBe('0.5');
    expect(canvas.style.visibility).not.toBe('hidden');
  });

  it("sizes its own height to the scaled content's (layout size × scale)", () => {
    const { container } = render(
      <ScaledCanvas designWidth={600}>
        <p>hi</p>
      </ScaledCanvas>
    );

    // canvas is 500px tall at 1×, scaled by 0.5
    expect((container.firstElementChild as HTMLElement).style.height).toBe('250px');
  });

  it('stays hidden until it can measure — there is no unscaled flash', () => {
    width = 0;
    render(
      <ScaledCanvas designWidth={600}>
        <p data-testid="child">hi</p>
      </ScaledCanvas>
    );

    const canvas = screen.getByTestId('child').parentElement as HTMLElement;
    expect(canvas.style.visibility).toBe('hidden');
    expect(canvas.style.getPropertyValue('--scaled-canvas-scale')).toBe('');
  });

  it('re-scales when the available width changes', () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    render(
      <ScaledCanvas designWidth={600}>
        <p data-testid="child">hi</p>
      </ScaledCanvas>
    );
    const canvas = screen.getByTestId('child').parentElement as HTMLElement;
    expect(canvas.style.getPropertyValue('--scaled-canvas-scale')).toBe('0.5');

    width = 150;
    act(() => notify());
    expect(canvas.style.getPropertyValue('--scaled-canvas-scale')).toBe('0.25');
  });

  it('is inert: aria-hidden, and its class carries pointer-events: none', () => {
    const { container } = render(
      <ScaledCanvas designWidth={600} className="mine">
        <p>hi</p>
      </ScaledCanvas>
    );

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveClass('scaled-canvas', 'mine');
  });

  describe('lazy', () => {
    let intersect: (isIntersecting: boolean) => void = () => {};

    beforeEach(() => {
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
            intersect = (isIntersecting) => callback([{ isIntersecting }]);
          }
          observe() {}
          disconnect() {}
        }
      );
    });

    it('renders nothing until the canvas is near the viewport, then keeps it', () => {
      render(
        <ScaledCanvas designWidth={600}>
          <p data-testid="child">hi</p>
        </ScaledCanvas>
      );
      expect(screen.queryByTestId('child')).toBeNull();

      act(() => intersect(false));
      expect(screen.queryByTestId('child')).toBeNull();

      act(() => intersect(true));
      expect(screen.getByTestId('child')).toBeInTheDocument();

      act(() => intersect(false));
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('lazy={false} renders immediately, without observing', () => {
      render(
        <ScaledCanvas designWidth={600} lazy={false}>
          <p data-testid="child">hi</p>
        </ScaledCanvas>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });
});
