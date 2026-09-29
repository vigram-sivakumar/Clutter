import { useState } from 'react';

const STORAGE_KEY = 'clutter-sidebar-width';

// Matches --app-sidebar-width's own default in tokens.css.
export const DEFAULT_SIDEBAR_WIDTH = 280;
export const MIN_SIDEBAR_WIDTH = 280;
export const MAX_SIDEBAR_WIDTH = 420;

function clampWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function readStoredWidth(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  const parsed = stored ? Number(stored) : NaN;
  return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
}

/**
 * Single source of truth for the Sidebar's width — `width` drives the
 * `--app-sidebar-width` CSS variable live during a drag; `commitWidth`
 * additionally persists to localStorage, called only on pointer-up (see
 * SidebarResizeHandle) so a drag doesn't write on every pointermove.
 * Same per-value raw-localStorage convention as useTheme.ts — no shared
 * UI-state abstraction exists yet, and this doesn't introduce one.
 */
export function useSidebarWidth() {
  const [width, setWidth] = useState<number>(readStoredWidth);

  function commitWidth(next: number) {
    setWidth(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return { width, setWidth, commitWidth };
}
