import type { StartupBehavior } from '@core/application/Application';

const STORAGE_KEY = 'clutter-startup-behavior';

export const DEFAULT_STARTUP_BEHAVIOR: StartupBehavior = 'todays-note';

/**
 * App-global (not per-Space) like the theme and the sidebar width: the same raw per-value localStorage
 * convention as `useTheme`, read when a Space opens (`AppShell`) and written from Settings.
 */
export function readStartupBehavior(): StartupBehavior {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'todays-note' || stored === 'last-opened-note'
      ? stored
      : DEFAULT_STARTUP_BEHAVIOR;
  } catch {
    return DEFAULT_STARTUP_BEHAVIOR;
  }
}

export function writeStartupBehavior(behavior: StartupBehavior): void {
  try {
    localStorage.setItem(STORAGE_KEY, behavior);
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }
}
