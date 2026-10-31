import { vi } from 'vitest';

/**
 * A manual animation-frame clock: `requestAnimationFrame` callbacks queue until a test advances time, so a flight
 * can be inspected at any moment of its course.
 */
export function installFrameClock(): { step(ms: number): void; now(): number; pending(): number; uninstall(): void } {
  let time = 0;
  let nextId = 1;
  const queue = new Map<number, (now: number) => void>();

  vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void queue.delete(id));
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => time);

  return {
    /** Advances the clock by `ms`, running the frames that were queued (and any they queue in turn, a frame at a time). */
    step(ms) {
      const frames = Math.max(1, Math.round(ms / 16));
      for (let i = 0; i < frames; i += 1) {
        time += ms / frames;
        const due = [...queue.entries()];
        queue.clear();
        due.forEach(([, callback]) => callback(time));
      }
    },
    now: () => time,
    pending: () => queue.size,
    uninstall: () => {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
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
