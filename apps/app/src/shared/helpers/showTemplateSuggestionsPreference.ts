import { useSyncExternalStore } from 'react';

/**
 * Whether an empty note shows its "Start with template" suggestions (the suggested templates and the "+N more" entry).
 * On by default. App-wide, not per-Space, like Show references: raw per-value localStorage with a change notification so
 * open pages follow a change made in Settings.
 *
 * Only that section. The Templates page, the Add menu's From template, the template picker and applying a template to a
 * note are unaffected either way.
 */
export const DEFAULT_SHOW_TEMPLATE_SUGGESTIONS = true;

const STORAGE_KEY = 'clutter-show-template-suggestions';

export function readShowTemplateSuggestions(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default (on).
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_SHOW_TEMPLATE_SUGGESTIONS;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeShowTemplateSuggestions(show: boolean): void {
  try {
    if (show === DEFAULT_SHOW_TEMPLATE_SUGGESTIONS) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeShowTemplateSuggestions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useShowTemplateSuggestions(): boolean {
  return useSyncExternalStore(subscribeShowTemplateSuggestions, readShowTemplateSuggestions);
}
