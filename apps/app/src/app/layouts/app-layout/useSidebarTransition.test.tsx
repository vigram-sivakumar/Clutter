// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSidebarTransition } from './useSidebarTransition';

type WithAnimations = Omit<HTMLElement, 'getAnimations'> & { getAnimations: () => unknown[] };
const RUNNING = [{ transitionProperty: 'flex-basis' }];

// A browser reports a running slide through getAnimations (jsdom has none): by default the slot's flex-basis one is running.
beforeEach(() => {
  (HTMLElement.prototype as unknown as WithAnimations).getAnimations = () => RUNNING;
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Partial<WithAnimations>).getAnimations;
});

/** A stand-in for AppLayout's slot + the attribute its CSS hides the handle on. */
function Harness({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { transitioning, onTransitionEnd } = useSidebarTransition(visible, ref);

  return (
    <div data-testid="layout" data-sidebar-transitioning={transitioning || undefined}>
      <div data-testid="slot" ref={ref} onTransitionEnd={onTransitionEnd}>
        <span data-testid="child" />
      </div>
    </div>
  );
}

const setup = (visible = true) => {
  const utils = render(<Harness visible={visible} />);
  const layout = () => utils.getByTestId('layout');
  const slot = () => utils.getByTestId('slot');
  const toggleTo = (next: boolean) => utils.rerender(<Harness visible={next} />);
  const end = (propertyName = 'flex-basis', target: HTMLElement = slot()) =>
    fireEvent.transitionEnd(target, { propertyName });
  const hidden = () => layout().hasAttribute('data-sidebar-transitioning');

  return { ...utils, layout, slot, toggleTo, end, hidden };
};

describe('useSidebarTransition — the handle is hidden for the sidebar slide', () => {
  it('is not transitioning on the first render', () => {
    expect(setup().hidden()).toBe(false);
  });

  it('collapsing: hidden at once, stays hidden through the slide, shown again when the slot\'s flex-basis transition ends', () => {
    const { toggleTo, hidden, end } = setup(true);

    toggleTo(false);
    expect(hidden()).toBe(true);

    // Unrelated transitions (the page's padding-left) never end it.
    end('padding-left');
    expect(hidden()).toBe(true);

    end('flex-basis');
    expect(hidden()).toBe(false);
  });

  it('expanding behaves the same way', () => {
    const { toggleTo, hidden, end } = setup(false);

    toggleTo(true);
    expect(hidden()).toBe(true);
    end();
    expect(hidden()).toBe(false);
  });

  it('only the slot\'s own transition counts — a descendant\'s flex-basis transition does not end it', () => {
    const { toggleTo, hidden, end, getByTestId } = setup(true);

    toggleTo(false);
    end('flex-basis', getByTestId('child'));

    expect(hidden()).toBe(true);
  });

  it('rapid toggling never leaves it stuck: still hidden mid-way, shown after the last slide ends', () => {
    const { toggleTo, hidden, end } = setup(true);

    toggleTo(false);
    toggleTo(true);
    toggleTo(false);
    expect(hidden()).toBe(true);

    end();
    expect(hidden()).toBe(false);

    toggleTo(true);
    expect(hidden()).toBe(true);
    end();
    expect(hidden()).toBe(false);
  });

  it('a toggle that starts no transition (reduced motion, zero duration) does not hide it at all', () => {
    const { slot, toggleTo, hidden } = setup(true);
    (slot() as WithAnimations).getAnimations = () => [];

    toggleTo(false);

    expect(hidden()).toBe(false);
  });

  it('a zero computed duration is also "no slide" where the animations API is missing', () => {
    const { toggleTo, hidden } = setup(true);
    delete (HTMLElement.prototype as unknown as Partial<WithAnimations>).getAnimations;
    const style = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ transitionDuration: '0s' } as CSSStyleDeclaration);

    toggleTo(false);
    expect(hidden()).toBe(false);
    style.mockRestore();
  });

  it('with the animations API, a running flex-basis transition hides it and its end shows it', () => {
    const { toggleTo, hidden, end } = setup(true);

    toggleTo(false);
    expect(hidden()).toBe(true);
    end();
    expect(hidden()).toBe(false);
  });

  it('a cancelled transition with nothing running clears it; one replaced by a running reversal does not', () => {
    const { slot, toggleTo, hidden } = setup(true);
    const element = slot() as WithAnimations;
    toggleTo(false);
    expect(hidden()).toBe(true);

    const cancel = () =>
      act(() => {
        const event = new Event('transitioncancel') as Event & { propertyName: string };
        event.propertyName = 'flex-basis';
        element.dispatchEvent(event);
      });

    cancel();
    expect(hidden()).toBe(true);

    element.getAnimations = () => [];
    cancel();
    expect(hidden()).toBe(false);
  });

  it('a manual resize never toggles the sidebar, so the handle is never hidden by it', () => {
    const { rerender, hidden } = setup(true);

    rerender(<Harness visible />);
    rerender(<Harness visible />);

    expect(hidden()).toBe(false);
  });
});
