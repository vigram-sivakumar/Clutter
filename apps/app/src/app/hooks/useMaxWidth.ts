import { useSyncExternalStore } from 'react';

/** The app window width at or below which the sidebar collapses automatically. */
export const SIDEBAR_COLLAPSE_BREAKPOINT = 1160;
/** The app window width at or below which the cover image hides automatically. */
export const COVER_HIDE_BREAKPOINT = 720;

function queryFor(maxWidth: number): string {
  return `(max-width: ${maxWidth}px)`;
}

function subscribeTo(maxWidth: number, onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const list = window.matchMedia(queryFor(maxWidth));
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function readSnapshot(maxWidth: number): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(queryFor(maxWidth)).matches;
}

/**
 * Whether the app window is `maxWidth`px wide or narrower. Backed by a media query, so React only
 * re-renders when the breakpoint is crossed — never per resize event — and the first render already
 * has the right answer (an app launched narrow starts collapsed, with no transition to play).
 */
export function useMaxWidth(maxWidth: number): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeTo(maxWidth, onChange),
    () => readSnapshot(maxWidth)
  );
}
