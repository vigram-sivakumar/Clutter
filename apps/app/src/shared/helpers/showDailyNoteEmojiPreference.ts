import { useSyncExternalStore } from 'react';

/**
 * Whether a Daily Note's emoji is shown on its row in the sidebar's Daily notes list. Off by default. App-wide, not
 * per-Space, like the Date format and the assets-in-folders choice: raw per-value localStorage with a change notification
 * so the sidebar follows a change made in Settings without a restart.
 *
 * Presentation only, and only that list: the emoji stays in the note's `icon` frontmatter, in the page's own title, and on
 * every other kind of sidebar item. This is never read for anything but that one row.
 */
export const DEFAULT_SHOW_DAILY_NOTE_EMOJI = false;

const STORAGE_KEY = 'clutter-show-daily-note-emoji';

export function readShowDailyNoteEmoji(): boolean {
  try {
    // Only an explicit "true" turns it on; a missing, cleared or unrecognised value is the default (off).
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return DEFAULT_SHOW_DAILY_NOTE_EMOJI;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeShowDailyNoteEmoji(show: boolean): void {
  try {
    if (show === DEFAULT_SHOW_DAILY_NOTE_EMOJI) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeShowDailyNoteEmoji(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useShowDailyNoteEmoji(): boolean {
  return useSyncExternalStore(subscribeShowDailyNoteEmoji, readShowDailyNoteEmoji);
}
