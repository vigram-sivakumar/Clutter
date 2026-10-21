import { useSyncExternalStore } from 'react';

/**
 * Whether a note's References section shows itself when the note has at least one reference and the user has made no
 * choice for that note. On by default. App-wide, not per-Space, like the Date format and the assets-in-folders choice: raw
 * per-value localStorage with a change notification so open pages follow a change made in Settings.
 *
 * Only the automatic case. A note's own saved Show or Hide (`ReferencesDisplayStore`) always wins over this, and this never
 * writes it: turning this off leaves every saved choice as it is, and the top-bar "Show/Hide references" still works either way.
 */
export const DEFAULT_SHOW_REFERENCES_AUTOMATICALLY = true;

const STORAGE_KEY = 'clutter-show-references-automatically';

export function readShowReferencesAutomatically(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default (on).
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_SHOW_REFERENCES_AUTOMATICALLY;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeShowReferencesAutomatically(show: boolean): void {
  try {
    if (show === DEFAULT_SHOW_REFERENCES_AUTOMATICALLY) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeShowReferencesAutomatically(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useShowReferencesAutomatically(): boolean {
  return useSyncExternalStore(subscribeShowReferencesAutomatically, readShowReferencesAutomatically);
}
