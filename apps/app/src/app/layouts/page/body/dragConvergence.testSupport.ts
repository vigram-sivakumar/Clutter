import { vi } from 'vitest';

/** A stand-in for `Element.animate` (jsdom has none) that records every animation and lets a test finish it. */
export interface FakeAnimation {
  readonly element: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
  reversed: number;
  cancelled: boolean;
  finished: Promise<unknown>;
  reverse(): void;
  cancel(): void;
  /** Plays the animation to its end (whichever way it is going). */
  complete(): void;
}

export function installFakeAnimate(): { animations: FakeAnimation[]; uninstall(): void } {
  const animations: FakeAnimation[] = [];
  const original = Element.prototype.animate;

  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: (value?: unknown) => void;
    const animation: FakeAnimation = {
      element: this,
      keyframes,
      options,
      reversed: 0,
      cancelled: false,
      finished: new Promise((r) => (resolve = r)),
      reverse() {
        animation.reversed += 1;
        animation.finished = new Promise((r) => (resolve = r));
      },
      cancel() {
        animation.cancelled = true;
        resolve();
      },
      complete() {
        resolve();
      },
    };
    animations.push(animation);
    return animation as unknown as Animation;
  } as typeof Element.prototype.animate;

  return {
    animations,
    uninstall() {
      Element.prototype.animate = original;
    },
  };
}

export function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}
