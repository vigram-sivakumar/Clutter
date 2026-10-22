import { useSyncExternalStore } from 'react';
import {
  FOLDER_ITEM_LIMIT_CHOICES,
  toFolderItemLimit,
  type FolderItemLimitChoice,
} from './folderItemLimitPreference';

/**
 * How many tasks each Tasks sidebar list shows before the rest sit behind its "N more" row: the same choices the folder
 * "Show" setting offers (5, 10, 15, 20 or `'all'`), kept as its own app-wide choice (raw per-value localStorage, with a
 * change notification, like the folder one). The list is a section, or — with Group by due date on — each date group; the
 * one choice applies to both, so switching grouping never resets it. The default is 5, and what a missing, cleared or
 * unrecognised stored value means; choosing it removes the saved value.
 */
export type TaskItemLimitChoice = FolderItemLimitChoice;

export const DEFAULT_TASK_ITEM_LIMIT_CHOICE: TaskItemLimitChoice = 5;

const STORAGE_KEY = 'clutter-task-item-limit';

export function readTaskItemLimitChoice(): TaskItemLimitChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const choice = stored === 'all' ? 'all' : Number(stored);
    return (FOLDER_ITEM_LIMIT_CHOICES as readonly unknown[]).includes(choice)
      ? (choice as TaskItemLimitChoice)
      : DEFAULT_TASK_ITEM_LIMIT_CHOICE;
  } catch {
    return DEFAULT_TASK_ITEM_LIMIT_CHOICE;
  }
}

const listeners = new Set<() => void>();

export function writeTaskItemLimitChoice(choice: TaskItemLimitChoice): void {
  try {
    if (choice === DEFAULT_TASK_ITEM_LIMIT_CHOICE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(choice));
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeTaskItemLimitChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cap as a count: `Infinity` for "Show all", so `length > limit` is never true. */
export function useTaskItemLimit(): number {
  return toFolderItemLimit(useSyncExternalStore(subscribeTaskItemLimitChoice, readTaskItemLimitChoice));
}
