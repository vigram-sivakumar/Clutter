import { useEffect, useRef, useState } from 'react';

export const STARTUP_LOADER_MIN_MS = 1500;
export const STARTUP_LOADER_FADE_MS = 150;
type Phase = 'holding' | 'fading' | 'done';

/** Only the first opening frame is prolonged. Welcome, errors and restart
 * interruptions end the initial presentation immediately. */
export function useInitialLoadingFrame(opening: boolean, ready: boolean, interrupted: boolean): Phase {
  const [phase, setPhase] = useState<Phase>('holding');
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (phase === 'done') return;
    if (interrupted) {
      setPhase('done');
      return;
    }
    if (opening && started.current === null) started.current = performance.now();
    if (!ready || opening) return;
    if (started.current === null) {
      setPhase('done');
      return;
    }
    if (phase === 'fading') {
      const timer = setTimeout(() => setPhase('done'), STARTUP_LOADER_FADE_MS);
      return () => clearTimeout(timer);
    }
    const remaining = Math.max(0, STARTUP_LOADER_MIN_MS - (performance.now() - started.current));
    const timer = setTimeout(() => {
      const reduced = typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setPhase(reduced ? 'done' : 'fading');
    }, remaining);
    return () => clearTimeout(timer);
  }, [opening, ready, interrupted, phase]);

  return interrupted ? 'done' : phase;
}
