import { formatClockTime, type DateReference } from '@shared/helpers/time/dateReference';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

import { readWeekStart, startOfWeek, type WeekStart } from '@features/daily-notes/calendar/weekStart';
import { resolveDateExpression, resolveDayOfMonth, type DateExpressionContext } from './dateExpressions';
import { parseTimeToken, resolveDateQuery, to24Hour } from './dateQueryResolver';

/**
 * A candidate offered by Date's own completion source. Accepting one inserts `@` plus its canonical stored text
 * (`serializeDateReference`): `@YYYY-MM-DD` for a date suggestion, `@YYYY-MM-DDTHH:mm` (24-hour, local wall-clock)
 * for a time suggestion.
 *
 * `label` is no longer what the popup row itself visibly shows — `dateCompletionRow.ts` derives the visible text
 * instead, through the shared date and time formatters (the user's Date format preference and the system locale).
 * `label` remains CM6's own `Completion.label`, an internal identifier existing consumers (this file's tests
 * included) key off to find a specific suggestion among the returned options.
 */
export interface DateSuggestion {
  readonly label: string;
  readonly isoDate: string;
  /**
   * Present only on a time suggestion: the time of day it names. Stored with the date on acceptance
   * (`@2026-10-23T07:00`); the suggestion's `isoDate` is today.
   */
  readonly time?: { readonly hour24: number; readonly minute: number };
}

/**
 * Relative-keyword shorthand — `Today`/`Tomorrow`/`Yesterday` only
 * (locked in docs/editor-architecture-decisions.md: insertion-time
 * shorthand only, never persisted).
 */
const RELATIVE_OFFSETS: ReadonlyMap<string, number> = new Map([
  ['Today', 0],
  ['Tomorrow', 1],
  ['Yesterday', -1],
]);

function relativeISODate(referenceDate: Date, offsetDays: number): string {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return toISODate(date);
}

/** A whole number of one or two digits with no leading zero: what could be an hour or a day of the month. */
const BARE_NUMBER = /^[1-9]\d?$/;

/**
 * The time reading of a single token (`2`, `1:30`, `7p`), or none. Built on the existing time grammar
 * (`parseTimeToken`): which tokens are times, and that a bare 1–11 is that hour in the morning and 12 is noon,
 * are unchanged. The suggestion's `isoDate` is today; its `time` is what the row shows.
 */
function timeSuggestion(token: string, referenceDate: Date): DateSuggestion | null {
  const time = parseTimeToken(token);
  const resolved = time ? resolveDateQuery(token, referenceDate) : null;
  if (!time || !resolved) {
    return null;
  }
  return { label: resolved.label, isoDate: resolved.isoDate, time: { hour24: to24Hour(time), minute: time.minute } };
}

function dayOfMonthSuggestion(day: number, referenceDate: Date): DateSuggestion | null {
  const resolved = resolveDayOfMonth(day, referenceDate);
  return resolved ? { label: resolved.label, isoDate: resolved.isoDate } : null;
}

/**
 * What typing `@query` offers, best first — at most two suggestions, and two only for a bare number that reads as
 * both an hour and a day of the month. Tried in order:
 * - A relative keyword whose label starts with the typed text (case-insensitive), **first match only** in declared
 *   order (Today, Tomorrow, Yesterday): "" and "@t" both resolve to Today.
 * - A bare number. `1`–`12` is a time (existing meaning, never the next upcoming one) AND the day of the month: the
 *   time first, then the date. `13`–`31` is the day only. If both would insert the same date (today is that day)
 *   the date alone is offered, since it says exactly what will be inserted. `0` and `32` up offer nothing.
 * - Any other time (`1:30`, `7p`): the time alone, as before.
 * - A natural-language expression (`7d`, `in 3 weeks`, `next friday`, `24th`, `fri`) — see `dateExpressions.ts`.
 * - The older grammar: month words, day + month, year + month (+ day), an ISO date.
 * A partial shape with nothing to complete to offers nothing — no guessing.
 *
 * `referenceDate` and `weekStart` default to the real local "now" and the Settings choice: parameters only so tests
 * can pin them. Calendar arithmetic is local, never UTC or millisecond math.
 */
export function getDateSuggestions(
  query: string,
  referenceDate: Date = new Date(),
  weekStart: WeekStart = readWeekStart()
): readonly DateSuggestion[] {
  const trimmed = query.trim();
  const normalized = trimmed.toLowerCase();

  if (trimmed === '' || /^[A-Za-z]+$/.test(trimmed)) {
    for (const [label, offset] of RELATIVE_OFFSETS) {
      if (label.toLowerCase().startsWith(normalized)) {
        return [{ label, isoDate: relativeISODate(referenceDate, offset) }];
      }
    }
  }

  if (BARE_NUMBER.test(trimmed)) {
    const time = timeSuggestion(trimmed, referenceDate);
    const date = dayOfMonthSuggestion(Number(trimmed), referenceDate);
    if (time && date) {
      return time.isoDate === date.isoDate ? [date] : [time, date];
    }
    return [time ?? date].filter((suggestion): suggestion is DateSuggestion => suggestion !== null);
  }

  const time = timeSuggestion(trimmed, referenceDate);
  if (time) {
    return [time];
  }

  const context: DateExpressionContext = {
    referenceDate,
    startOfWeek: (date) => startOfWeek(new Date(date), weekStart),
  };
  const expression = resolveDateExpression(trimmed, context);
  if (expression) {
    return [{ label: expression.label, isoDate: expression.isoDate }];
  }

  const resolved = resolveDateQuery(trimmed, referenceDate);
  return resolved ? [{ label: resolved.label, isoDate: resolved.isoDate }] : [];
}

export type GetDateSuggestions = (query: string) => readonly DateSuggestion[];

/** The canonical stored reference for a suggestion (no `@`): the date, plus its `T HH:mm` for a time suggestion. */
export function suggestionReference(suggestion: DateSuggestion): DateReference {
  return suggestion.time
    ? { isoDate: suggestion.isoDate, time: formatClockTime(suggestion.time.hour24, suggestion.time.minute) }
    : { isoDate: suggestion.isoDate };
}
