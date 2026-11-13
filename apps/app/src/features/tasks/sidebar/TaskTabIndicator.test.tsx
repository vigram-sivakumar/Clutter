// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskTabIndicator } from './TaskTabIndicator';

let changePreference: (() => void) | undefined;
let preference: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'animate'
);
let animationCalls: {
  element: HTMLElement;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
}[];
let interruptedWidth: number | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  animationCalls = [];
  interruptedWidth = undefined;
  changePreference = undefined;
  preference = {
    matches: false,
    addEventListener: vi.fn((_type, listener) => {
      changePreference = listener;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => preference);
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: function (
      this: HTMLElement,
      frames: Keyframe[],
      options: KeyframeAnimationOptions
    ) {
      const cancel = vi.fn();
      animationCalls.push({ element: this, frames, options, cancel });
      return { playState: 'running', cancel };
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const current = this.classList.contains('task-tab-indicator')
        ? this.querySelector('.task-tab-indicator__current')
        : this;
      const badge = current?.querySelector('.count-badge');
      const label =
        badge?.querySelector('.task-tab-indicator__value')?.textContent ??
        badge?.textContent;
      const width =
        this.classList.contains('task-tab-indicator') &&
        interruptedWidth !== undefined
          ? interruptedWidth
          : label
            ? Math.max(16, label.length * 7 + 8)
            : 20;
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: 20,
        width,
        height: 20,
        toJSON() {},
      } as DOMRect;
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (originalAnimate)
    Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});
function setup(count: number) {
  const result = render(<TaskTabIndicator count={count} icon="check" />);
  return {
    ...result,
    update: (next: number) =>
      result.rerender(<TaskTabIndicator count={next} icon="check" />),
    root: () =>
      result.container.querySelector<HTMLElement>('.task-tab-indicator')!,
    current: () =>
      result.container.querySelector<HTMLElement>(
        '.task-tab-indicator__current'
      )!,
    ghost: () =>
      result.container.querySelector(
        '.task-tab-indicator__number-ghost, .task-tab-indicator__outgoing'
      ),
  };
}

describe('Task tab micro-interactions', () => {
  it('does not animate on initial mount', () => {
    const view = setup(3);
    expect(view.current()).toHaveTextContent('3');
    expect(view.root()).not.toHaveAttribute('data-motion');
    expect(view.ghost()).toBeNull();
    expect(animationCalls).toHaveLength(0);
  });
  it.each([
    [1, 2],
    [4, 3],
  ] as const)(
    'softly swaps %s → %s while retaining the badge background',
    (from, to) => {
      const view = setup(from);
      const badge = view.current().querySelector('.count-badge');
      view.update(to);
      expect(view.current().querySelector('.count-badge')).toBe(badge);
      expect(view.ghost()?.parentElement).toBe(badge);
      expect(badge?.children).toHaveLength(2);
      expect(view.current().querySelectorAll('.count-badge')).toHaveLength(1);
      expect(view.root()).toHaveAttribute('data-motion', 'number');
      expect(view.current()).toHaveTextContent(String(to));
      expect(view.ghost()).toHaveTextContent(String(from));
      act(() => {
        vi.advanceTimersByTime(280);
      });
      expect(view.ghost()).toBeNull();
      expect(view.current()).toHaveTextContent(String(to));
    }
  );
  it('softly swaps between icon and badge without remounting the wrapper', () => {
    const view = setup(0);
    const root = view.root();
    view.update(1);
    expect(view.root()).toBe(root);
    expect(view.root()).toHaveAttribute('data-motion', 'to-count');
    expect(view.current().querySelector('.count-badge')).toHaveTextContent('1');
    expect(view.ghost()?.querySelector('.app-icon')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(view.ghost()).toBeNull();
    view.update(0);
    expect(view.root()).toHaveAttribute('data-motion', 'to-icon');
    expect(view.current().querySelector('.count-badge')).toBeNull();
    expect(view.current().querySelector('.app-icon')).not.toBeNull();
    expect(view.ghost()).toHaveTextContent('1');
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(view.ghost()).toBeNull();
  });
  it('interrupts rapid updates without queuing stale numbers or timers', () => {
    const view = setup(1);
    view.update(2);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    view.update(3);
    expect(view.current()).toHaveTextContent('3');
    expect(view.ghost()).toHaveTextContent('2');
    expect(
      view.root().querySelectorAll('.task-tab-indicator__number-ghost')
    ).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(view.ghost()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(161);
    });
    expect(view.ghost()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('animates digit-count width changes and retargets from the current width', () => {
    const view = setup(9);
    view.update(10);
    expect(animationCalls[0]?.frames).toEqual([
      { width: '16px' },
      { width: '22px' },
    ]);
    const first = [...animationCalls];
    interruptedWidth = 18;
    view.update(100);
    expect(first.every(({ cancel }) => cancel.mock.calls.length === 1)).toBe(
      true
    );
    expect(animationCalls[2]?.frames).toEqual([
      { width: '18px' },
      { width: '29px' },
    ]);
  });
  it('does not animate when the displayed capped value stays 99+', () => {
    const view = setup(100);
    view.update(101);
    expect(view.current()).toHaveTextContent('99+');
    expect(view.root()).not.toHaveAttribute('data-motion');
    expect(view.ghost()).toBeNull();
    expect(animationCalls).toHaveLength(0);
  });
  it('respects reduced motion from the first render', () => {
    preference.matches = true;
    const view = setup(0);
    view.update(9);
    view.update(10);
    view.update(0);
    expect(view.current().querySelector('.app-icon')).not.toBeNull();
    expect(view.ghost()).toBeNull();
    expect(animationCalls).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels active motion when the system preference changes', () => {
    const view = setup(9);
    view.update(10);
    act(() => {
      preference.matches = true;
      changePreference?.();
    });
    expect(view.current()).toHaveTextContent('10');
    expect(view.ghost()).toBeNull();
    expect(
      animationCalls.every(({ cancel }) => cancel.mock.calls.length === 1)
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up animations, timers and the preference listener on unmount', () => {
    const view = setup(9);
    view.update(10);
    view.unmount();
    expect(
      animationCalls.every(({ cancel }) => cancel.mock.calls.length === 1)
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(preference.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    );
  });
  it('keeps all animation layers decorative for the parent tab’s accessible label', () => {
    const view = setup(1);
    view.update(0);
    expect(view.root()).toHaveAttribute('aria-hidden', 'true');
    expect(view.current()).toHaveAttribute('data-symbol', 'icon');
  });
});
