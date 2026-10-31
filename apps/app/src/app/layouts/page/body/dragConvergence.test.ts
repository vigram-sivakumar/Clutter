// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONVERGENCE_DURATION_MS,
  CONVERGENCE_MAX_STAGGERED,
  CONVERGENCE_STAGGER_MS,
  startConvergence,
} from './dragConvergence';
import { installFakeAnimate, stubReducedMotion, type FakeAnimation } from './dragConvergence.testSupport';

let fake: ReturnType<typeof installFakeAnimate>;
const reads: string[] = [];

function item(name: string, left: number, top: number, width = 100, height = 40): HTMLElement {
  const element = document.createElement('div');
  element.dataset.name = name;
  document.body.append(element);
  element.getBoundingClientRect = () => {
    reads.push(name);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  };
  return element;
}

beforeEach(() => {
  fake = installFakeAnimate();
  reads.length = 0;
  stubReducedMotion(false);
});
afterEach(() => {
  fake.uninstall();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const translateOf = (animation: FakeAnimation) => animation.keyframes.at(-1)!.transform;

describe('startConvergence', () => {
  it('flies every other item to the pressed one\'s centre — a grid, a list or table rows alike', () => {
    const primary = item('primary', 300, 200);
    const grid = item('grid', 100, 100); // a card up and to the left
    const row = item('row', 300, 400); // a row below it
    startConvergence(primary, [grid, row]);

    const byName = Object.fromEntries(fake.animations.map((a) => [(a.element as HTMLElement).dataset.name, a]));
    expect(translateOf(byName.grid!)).toBe('translate(200px, 100px)');
    expect(translateOf(byName.row!)).toBe('translate(0px, -200px)');
    expect(fake.animations).toHaveLength(2); // the pressed item itself is never animated
  });

  it('reads every bound before it animates anything (no per-item layout thrash)', () => {
    const primary = item('primary', 0, 0);
    const spy = vi.spyOn(Element.prototype, 'animate');
    startConvergence(primary, [item('a', 0, 50), item('b', 0, 100)]);

    expect(reads).toEqual(['primary', 'a', 'b']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('is smooth, short and restrained: eased, no scaling or rotation, fading near the end', () => {
    startConvergence(item('p', 0, 0), [item('a', 0, 60)]);
    const [animation] = fake.animations;

    expect(animation!.options.duration).toBe(CONVERGENCE_DURATION_MS);
    expect(animation!.options.easing).toMatch(/^cubic-bezier\(/);
    expect(animation!.options.fill).toBe('forwards');
    expect(JSON.stringify(animation!.keyframes)).not.toMatch(/scale|rotate/);
    expect(animation!.keyframes.at(-1)!.opacity).toBe(0);
    expect(animation!.keyframes[1]).toMatchObject({ opacity: 1 }); // it holds, then fades
  });

  it('staggers the flights slightly, and never more than a handful of steps for a large selection', () => {
    const others = Array.from({ length: 40 }, (_, i) => item(`o${i}`, 0, 50 * (i + 1)));
    startConvergence(item('p', 0, 0), others);

    const delays = fake.animations.map((a) => a.options.delay);
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBe(CONVERGENCE_STAGGER_MS);
    expect(Math.max(...(delays as number[]))).toBe(CONVERGENCE_MAX_STAGGERED * CONVERGENCE_STAGGER_MS);
    expect(fake.animations).toHaveLength(40);
  });

  it('with reduced motion only fades: no transform at all, and no stagger', () => {
    stubReducedMotion(true);
    startConvergence(item('p', 0, 0), [item('a', 0, 60), item('b', 0, 120)]);

    for (const animation of fake.animations) {
      expect(JSON.stringify(animation.keyframes)).not.toMatch(/transform/);
      expect(animation.options.delay).toBe(0);
    }
  });

  it('does nothing for an item that is not mounted, and for a drag with nobody to fly', () => {
    const primary = item('p', 0, 0);
    const gone = item('gone', 0, 50);
    gone.remove();

    startConvergence(primary, [gone]);
    startConvergence(primary, []);

    expect(fake.animations).toHaveLength(0);
  });

  describe('revert (a cancelled drag, a release with no valid drop, a refused drop)', () => {
    it('plays every animation back, and clears them once they have returned', async () => {
      const convergence = startConvergence(item('p', 0, 0), [item('a', 0, 50), item('b', 0, 100)]);

      convergence.revert();
      expect(fake.animations.every((a) => a.reversed === 1 && !a.cancelled)).toBe(true);

      fake.animations.forEach((a) => a.complete());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fake.animations.every((a) => a.cancelled)).toBe(true);
    });

    it('works from mid-flight: it reverses what has not finished (the same call, finished or not)', () => {
      const convergence = startConvergence(item('p', 0, 0), [item('a', 0, 50)]);

      convergence.revert(); // nothing has completed yet

      expect(fake.animations[0]!.reversed).toBe(1);
    });

    it('leaves nothing behind even if the animations never report finishing', () => {
      vi.useFakeTimers();
      const convergence = startConvergence(item('p', 0, 0), [item('a', 0, 50)]);

      convergence.revert();
      vi.advanceTimersByTime(CONVERGENCE_DURATION_MS + CONVERGENCE_MAX_STAGGERED * CONVERGENCE_STAGGER_MS + 250);

      expect(fake.animations[0]!.cancelled).toBe(true);
      vi.useRealTimers();
    });

    it('is safe to call twice, and a commit or dispose after it changes nothing more', () => {
      const convergence = startConvergence(item('p', 0, 0), [item('a', 0, 50)]);

      convergence.revert();
      convergence.revert();
      convergence.commit();

      expect(fake.animations[0]!.reversed).toBe(1);
    });
  });

  describe('commit (a drop that moved or reordered)', () => {
    it('never plays back; it clears the animations once the collection has rendered', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 16));
      const convergence = startConvergence(item('p', 0, 0), [item('a', 0, 50)]);

      convergence.commit();
      expect(fake.animations[0]!.reversed).toBe(0);
      expect(fake.animations[0]!.cancelled).toBe(false); // not before the render: the old cards must not flash back

      vi.advanceTimersByTime(100);
      expect(fake.animations[0]!.cancelled).toBe(true);
      expect(fake.animations[0]!.reversed).toBe(0);
      vi.useRealTimers();
    });
  });

  it('dispose clears everything at once, with no animation back', () => {
    const convergence = startConvergence(item('p', 0, 0), [item('a', 0, 50), item('b', 0, 100)]);

    convergence.dispose();

    expect(fake.animations.every((a) => a.cancelled && a.reversed === 0)).toBe(true);
  });
});
