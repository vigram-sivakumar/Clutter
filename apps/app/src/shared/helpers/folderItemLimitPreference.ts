import { useSyncExternalStore } from 'react';

/**
 * How many notes and files each sidebar folder lists before the rest sit behind its "N more" row: one of a
 * few counts, or `'all'` (no cap — a folder never shows "N more"). App-wide, not per-Space, like the Date
 * format: raw per-value localStorage, with a change notification so the sidebar follows a change made in
 * Settings. The default (10, and what a missing, cleared or unrecognised stored value means) is the cap the
 * sidebar always had; choosing it removes the saved value.
 */
export const FOLDER_ITEM_LIMIT_CHOICES = [5, 10, 15, 20, 'all'] as const;

export type FolderItemLimitChoice = (typeof FOLDER_ITEM_LIMIT_CHOICES)[number];

export const DEFAULT_FOLDER_ITEM_LIMIT_CHOICE: FolderItemLimitChoice = 10;

const STORAGE_KEY = 'clutter-folder-item-limit';

export function readFolderItemLimitChoice(): FolderItemLimitChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const choice = stored === 'all' ? 'all' : Number(stored);
    return (FOLDER_ITEM_LIMIT_CHOICES as readonly unknown[]).includes(choice)
      ? (choice as FolderItemLimitChoice)
      : DEFAULT_FOLDER_ITEM_LIMIT_CHOICE;
  } catch {
    return DEFAULT_FOLDER_ITEM_LIMIT_CHOICE;
  }
}

const listeners = new Set<() => void>();

export function writeFolderItemLimitChoice(choice: FolderItemLimitChoice): void {
  try {
    if (choice === DEFAULT_FOLDER_ITEM_LIMIT_CHOICE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(choice));
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeFolderItemLimitChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cap as a count: `Infinity` for "Show all", so `index >= limit` and `length > limit` are never true. */
export function toFolderItemLimit(choice: FolderItemLimitChoice): number {
  return choice === 'all' ? Infinity : choice;
}

/** The current cap, re-read (and the component re-rendered) whenever Settings changes it. */
export function useFolderItemLimit(): number {
  return toFolderItemLimit(
    useSyncExternalStore(subscribeFolderItemLimitChoice, readFolderItemLimitChoice)
  );
}
