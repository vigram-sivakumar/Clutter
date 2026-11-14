import { useSyncExternalStore } from 'react';
export type DefaultTaskLocation = 'today' | 'due-date' | 'inbox';
export const DEFAULT_TASK_LOCATION: DefaultTaskLocation = 'inbox';
const STORAGE_KEY = 'clutter-default-task-location';
const listeners = new Set<() => void>();
export function readDefaultTaskLocation(): DefaultTaskLocation {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'inbox' || value === 'today' || value === 'due-date'
      ? value
      : DEFAULT_TASK_LOCATION;
  } catch {
    return DEFAULT_TASK_LOCATION;
  }
}
export function writeDefaultTaskLocation(value: DefaultTaskLocation): void {
  try {
    if (value === DEFAULT_TASK_LOCATION) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Existing preferences are best-effort. */
  }
  listeners.forEach((listener) => listener());
}
export function subscribeDefaultTaskLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useDefaultTaskLocation(): DefaultTaskLocation {
  return useSyncExternalStore(
    subscribeDefaultTaskLocation,
    readDefaultTaskLocation
  );
}
