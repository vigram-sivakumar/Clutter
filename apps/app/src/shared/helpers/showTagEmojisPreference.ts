import { useSyncExternalStore } from 'react';

/**
 * Whether a tag's assigned emoji is shown in the editor — on its pill in a note's Tags property, and on a `#tag` reference
 * in the Markdown body — in place of the `#`. On by default.
 * App-wide, not per-Space, like the Show emoji and Date format choices: raw per-value localStorage with a change
 * notification so open pages follow a change made in Settings without a restart.
 *
 * Presentation only, and only those two surfaces: the emoji stays assigned to the tag (`.clutter/tags.json`), and the Tags
 * sidebar, the autocomplete rows and every other surface keep showing it. Nothing is written to a tag or a note, and the
 * Markdown on disk keeps its `#tag`.
 */
export const DEFAULT_SHOW_TAG_EMOJIS = true;

const STORAGE_KEY = 'clutter-show-tag-emojis';

export function readShowTagEmojis(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default (on).
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_SHOW_TAG_EMOJIS;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeShowTagEmojis(show: boolean): void {
  try {
    if (show === DEFAULT_SHOW_TAG_EMOJIS) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeShowTagEmojis(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useShowTagEmojis(): boolean {
  return useSyncExternalStore(subscribeShowTagEmojis, readShowTagEmojis);
}
