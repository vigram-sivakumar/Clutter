import { useEffect, useState } from 'react';

/** How far outside the viewport (px) a card may be before its preview is first rendered. */
const PRELOAD_MARGIN_PX = 400;

/**
 * True once the element has come within `PRELOAD_MARGIN_PX` of the
 * viewport — and stays true afterwards (the observer disconnects), so
 * scrolling back never re-parses. Environments without
 * `IntersectionObserver` (jsdom, very old webviews) render immediately.
 */
export function useHasBeenNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (near || !element) {
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
  }, [near, ref]);

  return near;
}

