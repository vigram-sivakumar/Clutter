import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * True for exactly one commit after a responsive breakpoint flips (sidebar or cover), so CSS can switch the layout
 * transitions off for that change. A breakpoint flip comes from the window's width, and a window being zoomed or
 * resized is already moving: a 320ms slide started mid-resize would compete with it. Deliberate toggles never set
 * this, so they keep their animation.
 *
 * It turns on in the same render that sees the flip, so the attribute and the new layout state commit together. The
 * layout effect then forces a style flush with the suppression still applied (nothing starts transitioning) before
 * clearing it; removing it afterwards changes no animated value, so nothing starts then either. No timer, and it is
 * never left on for a later manual toggle.
 */
export function useResponsiveSnap(
  isNarrow: boolean,
  isCoverNarrow: boolean,
  flushRef: RefObject<HTMLElement | null>
): boolean {
  const [seen, setSeen] = useState({ isNarrow, isCoverNarrow });
  const [snap, setSnap] = useState(false);

  if (seen.isNarrow !== isNarrow || seen.isCoverNarrow !== isCoverNarrow) {
    setSeen({ isNarrow, isCoverNarrow });
    setSnap(true);
  }

  useLayoutEffect(() => {
    if (!snap) {
      return;
    }
    flushRef.current?.getBoundingClientRect();
    setSnap(false);
  }, [snap, flushRef]);

  return snap;
}
