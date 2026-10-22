import { useSyncExternalStore } from 'react';

/**
 * Whether the Tasks sidebar splits the tasks of each of its sections (Today, Overdue, Upcoming) into one group per due
 * date, oldest first, instead of one flat list. Off by default. App-wide, not per-Space, like the Show emoji and Date
 * format choices: raw per-value localStorage with a change notification so the sidebar follows a change made in Settings
 * without a restart.
 *
 * Presentation only: which tasks are in a section and their order come from `groupTasks` either way, and the collection
 * pages are never affected. Nothing is written to a task or a note.
 */
export const DEFAULT_GROUP_TASKS_BY_DUE_DATE = false;

const STORAGE_KEY = 'clutter-group-tasks-by-due-date';

export function readGroupTasksByDueDate(): boolean {
  try {
    // Only an explicit "true" turns it on; a missing, cleared or unrecognised value is the default (off).
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return DEFAULT_GROUP_TASKS_BY_DUE_DATE;
  }
}

const listeners = new Set<() => void>();

/** Saves the choice. Choosing the default removes the saved value, so a missing value is the default again. */
export function writeGroupTasksByDueDate(group: boolean): void {
  try {
    if (group === DEFAULT_GROUP_TASKS_BY_DUE_DATE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeGroupTasksByDueDate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current choice, re-read (and the component re-rendered) whenever Settings changes it. */
export function useGroupTasksByDueDate(): boolean {
  return useSyncExternalStore(subscribeGroupTasksByDueDate, readGroupTasksByDueDate);
}
