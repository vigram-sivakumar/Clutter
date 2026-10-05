import { useEffect, useState } from 'react';

/** How far outside the viewport (px) an element may be before it counts as near. */
const PRELOAD_MARGIN_PX = 400;

/**
 * True once the element has come within `PRELOAD_MARGIN_PX` of the viewport,
 * and stays true afterwards (the observer disconnects), so scrolling back
 * never re-renders. Disabled, or without `IntersectionObserver` (jsdom, very
 * old webviews), it is true immediately.
 */
export function useHasBeenNearViewport(
  ref: React.RefObject<HTMLElement | null>,
  enabled = true
): boolean {
  const [near, setNear] = useState(() => !enabled || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!enabled || near || !element) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${PRELOAD_MARGIN_PX}px` }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, near, ref]);

  return !enabled || near;
}
