import { formatClockTime, type DateReference } from '@shared/helpers/time/dateReference';
import { formatAbsoluteDate } from '@shared/helpers/time/dateDisplay';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

import { readWeekStart, startOfWeek, type WeekStart } from '@features/daily-notes/calendar/weekStart';
import { resolveDateExpression, resolveDayOfMonth, suggestDateExpressions, type DateExpressionContext } from './dateExpressions';
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
  /** Present on a suggestion for a partly typed `next …` / `last …`: what the row names (`Next week`). */
  readonly phrase?: string;
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

/** `2pm`, `9a`, `2:30`, `2:30pm`, `14:30`: one token that is a time and cannot be anything else (never a bare number). */
const CLOCK_TOKEN = /^(\d{1,2}):(\d{2})(am|pm|a|p)?$/;
const BARE_HOUR_TOKEN = /^\d{1,2}$/;
const HOUR_MERIDIEM_TOKEN = /^(\d{1,2})(am|pm|a|p)$/;
/** The `4` of `4 pm`, and its `pm`: a time written in two words (only the whole `am` / `pm`, so `12 a` stays a month's start). */
const SPOKEN_HOUR = /^\d{1,2}$/;
const SPOKEN_MERIDIEM = /^(am|pm)$/;

interface ClockTime {
  readonly hour24: number;
  readonly minute: number;
}

/** A 12-hour clock reading, or null when the hour is not 1–12. */
function twelveHour(hour: number, meridiem: string, minute: number): ClockTime | null {
  if (hour < 1 || hour > 12) {
    return null;
  }
  return { hour24: to24Hour({ hour, meridiem: meridiem.startsWith('p') ? 'pm' : 'am' }), minute };
}

/**
 * A time written as one word: `2pm`, `12am` (midnight), `2:30pm`, or with a colon and no suffix, `14:30` as the
 * 24-hour clock reads it (`7:30` is 7:30 in the morning, as `@7:30` alone always was; `12:30` is half past noon).
 */
function parseClockToken(token: string, allowBareHour = false): ClockTime | null {
  if (allowBareHour && BARE_HOUR_TOKEN.test(token)) {
    // Beside a date expression a plain number is an hour of the 24-hour clock: `tomorrow 12` is noon, `tomorrow 16` 4pm.
    const hour = Number(token);
    return hour <= 23 ? { hour24: hour, minute: 0 } : null;
  }
  const clock = CLOCK_TOKEN.exec(token);
  if (clock) {
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (minute > 59) {
      return null;
    }
    return clock[3] ? twelveHour(hour, clock[3], minute) : hour <= 23 ? { hour24: hour, minute } : null;
  }
  const short = HOUR_MERIDIEM_TOKEN.exec(token);
  return short ? twelveHour(Number(short[1]), short[2]!, 0) : null;
}

const RELATIVE_WORDS: readonly [string, number][] = [
  ['today', 0],
  ['tomorrow', 1],
  ['yesterday', -1],
];

/**
 * The dates a date expression names, best first: every relative word it starts (two letters or more, so `to` is both
 * Today and Tomorrow, `tom` only Tomorrow), then what `dateExpressions.ts` makes of it. One date each.
 */
function resolveWholeDates(text: string, context: DateExpressionContext): string[] {
  const word = text.toLowerCase();
  const dates = word.length >= 2
    ? RELATIVE_WORDS.filter(([name]) => name.startsWith(word)).map(([, offset]) => relativeISODate(context.referenceDate, offset))
    : [];
  const expression = resolveDateExpression(text, context)?.isoDate;
  return [...new Set(expression ? [...dates, expression] : dates)];
}

/**
 * A time and a date expression in either order (`4pm tomorrow`, `next month 2pm`, `9am next friday`, `4 pm`, `14:30
 * tomorrow`): the date is resolved first, by the same expressions as anywhere else, then the time is put on it. With
 * no date expression the date is today. Both orders mean the same thing.
 *
 * A time is `2pm`, `2:30`, `14:30`, `2 pm`, or — next to a date expression — a plain hour of the 24-hour clock
 * (`tomorrow 12`, `16 friday`; 0–23). A partly typed `next …` / `last …` next to the time offers its candidates with that time (`12 next w`); other
 * unfinished expressions (`4pm next`, `in 3 4`) offer nothing.
 */
function dateAndTimeSuggestions(query: string, context: DateExpressionContext): DateSuggestion[] {
  const tokens = query.split(' ');
  // A bare number is a time only next to a date expression; on its own it is read by `getDateSuggestions` (hour or day).
  const bare = tokens.length >= 2;

  // The time is the last word (or the last two: `4 pm`) or the first, and whatever is left is the date expression.
  const splits: { time: (allowBare: boolean) => ClockTime | null; date: string[] }[] = [
    { time: (allowBare) => parseClockToken(tokens[tokens.length - 1]!, allowBare), date: tokens.slice(0, -1) },
    { time: () => spokenTime(tokens.slice(-2)), date: tokens.slice(0, -2) },
    { time: (allowBare) => parseClockToken(tokens[0]!, allowBare), date: tokens.slice(1) },
    { time: () => spokenTime(tokens.slice(0, 2)), date: tokens.slice(2) },
  ];

  for (const { time: readTime, date } of splits) {
    const dateText = date.join(' ');
    // A month-name date (`12 nov`, `nov 12`) owns its numbers: a bare number beside it is never an hour, so only an
    // unambiguous time (`12pm`, `4 pm`, `14:30`) is read there.
    const monthDate = resolveMonthNameDate(dateText, context.referenceDate);
    const time = readTime(bare && monthDate === null);
    if (!time) {
      continue;
    }
    const dates = dateText === '' ? [toISODate(context.referenceDate)] : monthDate ? [monthDate] : resolveWholeDates(dateText, context);
    if (dates.length > 0) {
      return dates.map((isoDate) => ({ label: formatAbsoluteDate(isoDate, context.referenceDate), isoDate, time }));
    }
    // A partly typed `next w` / `last fri` beside the time (`12 next w`, `next w 4pm`): its candidates, each with the time.
    const partial = dateText === '' ? [] : suggestDateExpressions(dateText, context);
    if (partial.length > 0) {
      return partial.map(({ label, isoDate, phrase }) => ({ label, isoDate, phrase, time }));
    }
  }
  return [];
}

/**
 * A month-name date written as two words, either order (`12 nov`, `nov 12`, `March 3`), resolved by the older grammar
 * (`resolveDateQuery`): the next occurrence, on or after today. A month word needs three letters, so `12 n` is nothing.
 */
function resolveMonthNameDate(text: string, referenceDate: Date): string | null {
  const words = text.split(' ');
  const [a, b] = words;
  if (words.length !== 2 || !((/^[A-Za-z]+$/.test(a!) && /^\d{1,2}$/.test(b!)) || (/^\d{1,2}$/.test(a!) && /^[A-Za-z]+$/.test(b!)))) {
    return null;
  }
  return resolveDateQuery(text, referenceDate)?.isoDate ?? null;
}

/**
 * `12 nov 12`, `nov 12 12`: a month-name date followed (or, `12 12 nov`, preceded) by one more bare number. The number
 * is never a time — without `am`/`pm` or a colon it is not one — so the date is offered alone.
 */
function monthDateWithExtraNumber(query: string, referenceDate: Date): string | null {
  const tokens = query.split(' ');
  if (tokens.length !== 3) {
    return null;
  }
  const [a, b, c] = tokens as [string, string, string];
  if (/^\d{1,2}$/.test(c)) {
    return resolveMonthNameDate(`${a} ${b}`, referenceDate);
  }
  if (/^\d{1,2}$/.test(a)) {
    return resolveMonthNameDate(`${b} ${c}`, referenceDate);
  }
  return null;
}

/** `4 pm` as two words, or null (also null for fewer than two words). */
function spokenTime(words: readonly string[]): ClockTime | null {
  const [hour, meridiem] = words;
  return words.length === 2 && SPOKEN_HOUR.test(hour!) && SPOKEN_MERIDIEM.test(meridiem!)
    ? twelveHour(Number(hour), meridiem!, 0)
    : null;
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
 * - A written-out time and a date expression, in either order (`next month 2pm`, `9am tomorrow`, `14:30`): the
 *   time on that date (a relative word of two letters offers each it starts: `to 2pm` is today and tomorrow) (today's when there is none) — see `dateAndTimeSuggestions`.
 * - A partly typed `next` / `last` (`n`, `next w`, `last fri`): its candidates, best first, one per date — see
 *   `suggestDateExpressions`.
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
  const dated = dateAndTimeSuggestions(trimmed, context);
  if (dated.length > 0) {
    return dated;
  }

  const extraNumber = monthDateWithExtraNumber(trimmed, referenceDate);
  if (extraNumber) {
    return [{ label: formatAbsoluteDate(extraNumber, referenceDate), isoDate: extraNumber }];
  }

  const partial = suggestDateExpressions(trimmed, context);
  if (partial.length > 0) {
    return partial.map(({ label, isoDate, phrase }) => ({ label, isoDate, phrase }));
  }

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
