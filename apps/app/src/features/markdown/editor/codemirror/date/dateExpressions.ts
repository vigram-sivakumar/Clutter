import { formatAbsoluteDate } from '@shared/helpers/time/dateDisplay';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { addMonthsClamped, addYearsClamped } from '@shared/helpers/time/calendarMath';
import type { DateQueryResult } from './dateQueryResolver';

/**
 * What the natural-language date expressions need from the app, injected so this module stays pure: the reference
 * "now" and where the week starts. `startOfWeek` returns the first day of the week of the date it is given
 * (Clutter's own week-start setting, applied by the caller), without changing the date it was given.
 */
export interface DateExpressionContext {
  readonly referenceDate: Date;
  readonly startOfWeek: (date: Date) => Date;
}

/**
 * The expressions that resolve to one calendar date, typed after `@`. All of it is local-calendar arithmetic: a day
 * is added with `setDate`, a month or year with the clamped helpers, never a count of milliseconds, so a daylight-
 * saving change or a short month cannot move the result off the day that was meant. A date is only ever offered
 * when it is complete: an unfinished expression (`in 3`, `next`, `7da`) resolves to nothing.
 *
 *   7d  7days  in 7days  in 7 days     today plus N calendar days (also w/week(s), month(s), y/year(s))
 *   in 3 weeks  in 2 months  in 1 year  today plus N, months and years clamped to the last day of a short month
 *   next week | last week              the first day of the next | previous calendar week (the week-start setting)
 *   next month | last month            today's day of the month, one month on | back (the last day of a shorter month)
 *   next year | last year              today's day and month, one year on | back (Feb 29 becomes Feb 28)
 *   next monday                        that weekday of the next calendar week
 *   last friday                        the most recent such weekday strictly before today
 *   fri  friday                        the next such weekday strictly after today
 *   24  7th  24th                      the day of the month (`resolveDayOfMonth`)
 *
 * `this week` and the like are deliberately not here: what they would mean (the start, the end, today) is not settled.
 */

const WEEKDAYS: readonly string[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Spellings that name one weekday outright, ahead of the prefix rule (`mon` is Monday although `month` also starts so). */
const WEEKDAY_ABBREVIATIONS: Readonly<Record<string, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

/**
 * A weekday by its full name or a standard abbreviation, and — with `allowPrefix` — by any prefix of one name (two
 * letters at least) that fits only that name (`fr`, `thu`). After `next` / `last` prefixes are not allowed: `next we`
 * could be on its way to `next week`, and offering Wednesday there would mislead.
 */
export function parseWeekday(word: string, allowPrefix = false): number | null {
  const lower = word.toLowerCase();
  const exact = WEEKDAYS.indexOf(lower);
  if (exact !== -1) {
    return exact;
  }
  if (WEEKDAY_ABBREVIATIONS[lower] !== undefined) {
    return WEEKDAY_ABBREVIATIONS[lower]!;
  }
  if (!allowPrefix || lower.length < 2) {
    return null;
  }
  const matches = WEEKDAYS.flatMap((name, index) => (name.startsWith(lower) ? [index] : []));
  return matches.length === 1 ? matches[0]! : null;
}

type Unit = 'day' | 'week' | 'month' | 'year';

const UNITS: Readonly<Record<string, Unit>> = {
  d: 'day',
  day: 'day',
  days: 'day',
  w: 'week',
  week: 'week',
  weeks: 'week',
  month: 'month',
  months: 'month',
  y: 'year',
  year: 'year',
  years: 'year',
};

const COMPACT_DURATION = /^(\d{1,4})([a-z]+)$/;
const ORDINAL = /^(\d{1,2})(st|nd|rd|th)$/;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Dates outside these years are not offered: they would not fit the stored `YYYY-MM-DD` shape or mean anything. */
function inRange(isoDate: string): boolean {
  const year = Number(isoDate.slice(0, isoDate.indexOf('-')));
  return year >= 1000 && year <= 9999;
}

function resultFor(isoDate: string, referenceDate: Date): DateQueryResult | null {
  return inRange(isoDate) && isValidCalendarDate(isoDate)
    ? { isoDate, label: formatAbsoluteDate(isoDate, referenceDate) }
    : null;
}

/** `amount` units from today, as a calendar date. */
function addUnits(referenceDate: Date, amount: number, unit: Unit): string {
  const today = startOfDay(referenceDate);
  switch (unit) {
    case 'day':
      return toISODate(addDays(today, amount));
    case 'week':
      return toISODate(addDays(today, amount * 7));
    case 'month':
      return addMonthsClamped(toISODate(today), amount);
    case 'year':
      return addYearsClamped(toISODate(today), amount);
  }
}

/** `7days`, `3weeks`, `2d`: a whole number and a complete unit, written together. */
function parseCompactDuration(token: string): { amount: number; unit: Unit } | null {
  const match = COMPACT_DURATION.exec(token);
  const unit = match ? UNITS[match[2]!] : undefined;
  return match && unit ? { amount: Number(match[1]), unit } : null;
}

/**
 * The day of the month `day`: that day of the current month when it is today or still ahead, otherwise the next month
 * that has it. The day number is the one typed — a month too short for it (`31` in a 30-day month) is skipped, never
 * clamped into a different day. Never a date in the past; null for a number that is not a day (0, 32 and up).
 */
export function resolveDayOfMonth(day: number, referenceDate: Date): DateQueryResult | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }
  const today = startOfDay(referenceDate);
  // A month with the 31st is never more than two months away, so a few months bound the search.
  for (let offset = 0; offset < 8; offset += 1) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const candidate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    if (candidate.getMonth() === monthStart.getMonth() && candidate.getTime() >= today.getTime()) {
      return resultFor(toISODate(candidate), referenceDate);
    }
  }
  return null;
}

/** The ordinal suffix the number takes (`1st`, `2nd`, `3rd`, `11th`, `24th`). */
function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) {
    return 'th';
  }
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}

/** The weekday `weekday` of the calendar week that starts on `weekStart`. */
function weekdayInWeek(weekStart: Date, weekday: number): Date {
  return addDays(weekStart, (weekday - weekStart.getDay() + 7) % 7);
}

/** The next `weekday` strictly after today. */
function nextWeekday(referenceDate: Date, weekday: number): Date {
  const today = startOfDay(referenceDate);
  return addDays(today, ((weekday - today.getDay() + 6) % 7) + 1);
}

/** The most recent `weekday` strictly before today. */
function lastWeekday(referenceDate: Date, weekday: number): Date {
  const today = startOfDay(referenceDate);
  return addDays(today, -(((today.getDay() - weekday + 6) % 7) + 1));
}

/** `next` / `last` plus a calendar period or a weekday. A word that could be either (`mon`) is the weekday only when it is an exact abbreviation. */
function resolveNextLast(direction: 'next' | 'last', word: string, ctx: DateExpressionContext): DateQueryResult | null {
  const { referenceDate } = ctx;
  const sign = direction === 'next' ? 1 : -1;
  const today = toISODate(startOfDay(referenceDate));

  if (word === 'week') {
    return resultFor(toISODate(addDays(ctx.startOfWeek(startOfDay(referenceDate)), 7 * sign)), referenceDate);
  }
  if (word === 'month') {
    return resultFor(addMonthsClamped(today, sign), referenceDate);
  }
  if (word === 'year') {
    return resultFor(addYearsClamped(today, sign), referenceDate);
  }

  const weekday = parseWeekday(word);
  if (weekday === null) {
    return null;
  }
  if (direction === 'next') {
    return resultFor(toISODate(weekdayInWeek(addDays(ctx.startOfWeek(startOfDay(referenceDate)), 7), weekday)), referenceDate);
  }
  return resultFor(toISODate(lastWeekday(referenceDate, weekday)), referenceDate);
}

function resolveDuration(amount: number, unit: Unit, referenceDate: Date): DateQueryResult | null {
  return resultFor(addUnits(referenceDate, amount, unit), referenceDate);
}

/**
 * The date a typed expression stands for, or null when it is not one of the expressions above or not yet complete.
 * `query` is the text after `@`. Numbers alone (`24`, which is also an hour up to 12) are not handled here: the
 * suggestion layer decides how a bare number is read.
 */
export function resolveDateExpression(query: string, ctx: DateExpressionContext): DateQueryResult | null {
  const tokens = query.trim().toLowerCase().split(' ');
  const { referenceDate } = ctx;

  if (tokens.some((token) => token === '')) {
    return null;
  }

  if (tokens.length === 1) {
    const token = tokens[0]!;
    const duration = parseCompactDuration(token);
    if (duration) {
      return resolveDuration(duration.amount, duration.unit, referenceDate);
    }
    const ordinal = ORDINAL.exec(token);
    if (ordinal) {
      const day = Number(ordinal[1]);
      return ordinalSuffix(day) === ordinal[2] ? resolveDayOfMonth(day, referenceDate) : null;
    }
    const weekday = /^[a-z]+$/.test(token) ? parseWeekday(token, true) : null;
    return weekday === null ? null : resultFor(toISODate(nextWeekday(referenceDate, weekday)), referenceDate);
  }

  if (tokens.length === 2) {
    const [first, second] = tokens as [string, string];
    if (first === 'in') {
      const duration = parseCompactDuration(second);
      return duration ? resolveDuration(duration.amount, duration.unit, referenceDate) : null;
    }
    if (first === 'next' || first === 'last') {
      return resolveNextLast(first, second, ctx);
    }
    return null;
  }

  if (tokens.length === 3) {
    const [first, amount, word] = tokens as [string, string, string];
    const unit = UNITS[word];
    if (first === 'in' && /^\d{1,4}$/.test(amount) && unit) {
      return resolveDuration(Number(amount), unit, referenceDate);
    }
  }

  return null;
}

/** A suggestion for a partly typed `next …` / `last …`: the phrase to show, and the date it stands for. */
export interface DateExpressionCandidate extends DateQueryResult {
  /** `Next week`, `Last Friday`: what the row names, since the date alone would not tell two candidates apart. */
  readonly phrase: string;
}

/** The most candidates a partly typed phrase offers: enough to choose from, never a list to scroll. */
export const MAX_EXPRESSION_CANDIDATES = 6;

const PERIODS: readonly string[] = ['week', 'month', 'year'];
const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A prefix that begins both a calendar period and a weekday, where the period is the meaning offered: `mo` is the
 * start of `month` far more often than of `Monday`, which has its own abbreviation, `mon`, to ask for it by.
 */
const PREFIXES_PREFERRING_THE_PERIOD: ReadonlySet<string> = new Set(['mo']);

/**
 * The expressions a partly typed `next <word>` / `last <word>` can still become, best first, each resolved by
 * `resolveDateExpression` — the one place the dates are computed. `query` is the text after `@`. Nothing is offered
 * until the second word has begun: `next`, `next `, `last` and anything shorter offer nothing.
 *
 *   next w  next we  last w    the periods that start with the word, then the weekdays that do (week, Wednesday)
 *   next m  last m             month, Monday
 *   next mo                    month only (`PREFIXES_PREFERRING_THE_PERIOD`)
 *   next wed  last fri         that weekday only; `mon` is Monday, not month, as it is everywhere else
 *
 * Periods come before weekdays; weekdays are in the order of their nearness to today (after it for `next`, before it
 * for `last`). Several phrases for one date offer the first only. Anything else (`next 3`, `in 3`, `next week x`)
 * offers nothing.
 */
export function suggestDateExpressions(query: string, ctx: DateExpressionContext): readonly DateExpressionCandidate[] {
  const tokens = query.trim().toLowerCase().split(' ');
  if (tokens.length !== 2 || !tokens.every((token) => /^[a-z]+$/.test(token))) {
    return [];
  }
  const [direction, word] = tokens as [string, string];
  if (direction !== 'next' && direction !== 'last') {
    return [];
  }

  const step = direction === 'next' ? 1 : -1;
  const todayWeekday = ctx.referenceDate.getDay();
  const weekdaysByNearness = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(todayWeekday + step * (i + 1) + 14) % 7]!);

  const named = parseWeekday(word);
  const words =
    named !== null
      ? [WEEKDAYS[named]!]
      : [
          ...PERIODS.filter((period) => period.startsWith(word)),
          ...(PREFIXES_PREFERRING_THE_PERIOD.has(word) ? [] : weekdaysByNearness.filter((name) => name.startsWith(word))),
        ];

  const seen = new Set<string>();
  const candidates: DateExpressionCandidate[] = [];
  for (const candidate of words) {
    const result = resolveDateExpression(`${direction} ${candidate}`, ctx);
    if (!result || seen.has(result.isoDate)) {
      continue;
    }
    seen.add(result.isoDate);
    candidates.push({
      ...result,
      phrase: `${capitalize(direction)} ${PERIODS.includes(candidate) ? candidate : capitalize(candidate)}`,
    });
    if (candidates.length === MAX_EXPRESSION_CANDIDATES) {
      break;
    }
  }
  return candidates;
}
