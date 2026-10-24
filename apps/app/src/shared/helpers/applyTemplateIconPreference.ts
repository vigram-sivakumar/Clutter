import { useSyncExternalStore } from 'react';

/**
 * Whether choosing a template suggestion on a note or Daily Note applies the template's icon. On by default, which is
 * how templates have always applied. App-wide, not per-Space, like the Date format and the assets-in-folders choice: raw
 * per-value localStorage with a change notification so open pages follow a change made in Settings.
 *
 * Only the choice of whether to apply it: nothing is written to a template or its frontmatter, and the target note's own
 * icon is never changed by this being off (applyTemplateToNote leaves it as it is).
 */
export const DEFAULT_APPLY_TEMPLATE_ICON = true;

const STORAGE_KEY = 'clutter-apply-template-icon';

export function readApplyTemplateIcon(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default (on).
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_APPLY_TEMPLATE_ICON;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeApplyTemplateIcon(apply: boolean): void {
  try {
    if (apply === DEFAULT_APPLY_TEMPLATE_ICON) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeApplyTemplateIcon(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useApplyTemplateIcon(): boolean {
  return useSyncExternalStore(subscribeApplyTemplateIcon, readApplyTemplateIcon);
}
