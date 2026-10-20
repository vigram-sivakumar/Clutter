import { useSyncExternalStore } from 'react';

import { getSystemLocale } from '@shared/helpers/time/dateLocale';

/** The day the calendar's week begins on. Presentation only: it never changes which date a cell is. */
export type WeekStart = 'sunday' | 'monday';

export const DEFAULT_WEEK_START: WeekStart = 'monday';

const STORAGE_KEY = 'clutter-week-start';

/** `Date.getDay()` index of each choice. */
const START_DAY: Record<WeekStart, number> = { sunday: 0, monday: 1 };

/** `date` moved back to the first day of its week. Mutates and returns `date`, like the callers' own `setDate`. */
export function startOfWeek(date: Date, weekStart: WeekStart): Date {
  date.setDate(
    date.getDate() - ((date.getDay() - START_DAY[weekStart] + 7) % 7)
  );
  return date;
}

/** 2024-01-07 was a Sunday, so day index `n` of that week is the one with `Date.getDay() === n`. */
function weekdayName(dayIndex: number, locale: string, width: 'long' | 'narrow'): string {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(new Date(2024, 0, 7 + dayIndex));
}

/**
 * The seven weekday names, in the order a calendar starting on `weekStart` shows them, in the system locale:
 * `'long'` for tooltips (`Monday`), `'narrow'` for the header's own labels (`M`).
 */
export function weekdayNames(
  weekStart: WeekStart,
  locale: string = getSystemLocale(),
  width: 'long' | 'narrow' = 'long'
): string[] {
  const first = START_DAY[weekStart];
  return Array.from({ length: 7 }, (_, index) => weekdayName((first + index) % 7, locale, width));
}

/**
 * App-global (not per-Space) like the theme: the same raw per-value localStorage convention as `useTheme`.
 * Only an explicitly saved `sunday` is Sunday-first; anything missing or unrecognised is Monday-first.
 */
export function readWeekStart(): WeekStart {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'sunday'
      ? 'sunday'
      : DEFAULT_WEEK_START;
  } catch {
    return DEFAULT_WEEK_START;
  }
}

const listeners = new Set<() => void>();

export function writeWeekStart(weekStart: WeekStart): void {
  try {
    localStorage.setItem(STORAGE_KEY, weekStart);
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current week start, re-read whenever Settings changes it, so every mounted calendar follows. */
export function useWeekStart(): WeekStart {
  return useSyncExternalStore(subscribe, readWeekStart);
}
