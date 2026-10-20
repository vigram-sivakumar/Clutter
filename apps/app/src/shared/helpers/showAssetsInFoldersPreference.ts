import { useSyncExternalStore } from 'react';

/**
 * Whether asset files (images, PDFs) that sit in an ordinary folder are listed there, in the sidebar's folder
 * tree, next to its notes and subfolders. On by default, which is how folders always listed them; off hides them
 * from those listings only. App-wide, not per-Space, like the Date format: raw per-value localStorage with a change
 * notification so the sidebar follows a change made in Settings.
 *
 * Presentation only. A hidden asset is not moved, archived or changed: it stays in its folder, still resolves for
 * every note that embeds it, and is still listed in the Assets section, which this never reads.
 */
export const DEFAULT_SHOW_ASSETS_IN_FOLDERS = true;

const STORAGE_KEY = 'clutter-show-assets-in-folders';

export function readShowAssetsInFolders(): boolean {
  try {
    // Only an explicit "false" turns it off; a missing, cleared or unrecognised value is the default.
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return DEFAULT_SHOW_ASSETS_IN_FOLDERS;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeShowAssetsInFolders(show: boolean): void {
  try {
    if (show === DEFAULT_SHOW_ASSETS_IN_FOLDERS) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeShowAssetsInFolders(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useShowAssetsInFolders(): boolean {
  return useSyncExternalStore(subscribeShowAssetsInFolders, readShowAssetsInFolders);
}
