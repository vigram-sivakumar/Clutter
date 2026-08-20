import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

/**
 * Turns a free-typed `@query` (already stripped of the leading `@`) into at
 * most one date/time interpretation — the "always prefer ONE result, never
 * a list" completion UX. Pure and deterministic: no CM6/DOM dependency, no
 * Vault/persistence dependency, same shape/placement precedent as
 * `dateSuggestion.ts`'s own `getDateSuggestions`, which is this module's
 * only caller.
 *
 * Deliberately NOT a general natural-language date parser — a small,
 * closed grammar (relative word / time / month / day+month / year+month /
 * year+month+day / ISO date), each branch a direct, literal match for the
 * frozen UX's own examples, nothing inferred beyond them.
 *
 * `isoDate` is always date-only (`YYYY-MM-DD`) — a time interpretation
 * (`@12`) is autocomplete-display-only for now: its `label` shows the
 * time, but its `isoDate` is just today's date, per the explicit product
 * decision not to introduce persisted time/datetime syntax as part of this
 * work. `Date`'s canonical stored/grammar form remains untouched.
 */
export interface DateQueryResult {
  readonly isoDate: string;
  readonly label: string;
}

/** Shared with `dateTrigger.ts` — no supported grammar form uses more than 3 space-separated tokens (`year month day`). */
export const MAX_DATE_QUERY_TOKENS = 3;

const MONTHS: readonly { readonly name: string; readonly label: string }[] = [
  { name: 'january', label: 'January' },
  { name: 'february', label: 'February' },
  { name: 'march', label: 'March' },
  { name: 'april', label: 'April' },
  { name: 'may', label: 'May' },
  { name: 'june', label: 'June' },
  { name: 'july', label: 'July' },
  { name: 'august', label: 'August' },
  { name: 'september', label: 'September' },
  { name: 'october', label: 'October' },
  { name: 'november', label: 'November' },
  { name: 'december', label: 'December' },
];

/**
 * Strict month-word matching — used for a month standalone (`@mar`) and
 * for day+month (`@12 mar`/`@mar 12`). Requires >= 3 characters *and* a
 * unique prefix match, per the frozen UX's own examples: `@m` → no result,
 * `@s`/`@se` → no result (both rejected by length alone — no two month
 * names/abbreviations actually collide at 3+ characters, so length is the
 * only gate that matters in practice), `@sep`/`@mar`/`@march` → resolved.
 */
function classifyMonthStrict(token: string): number | null {
  const lower = token.toLowerCase();
  if (lower.length < 3) {
    return null;
  }
  const matches = MONTHS.filter((month) => month.name.startsWith(lower));
  return matches.length === 1 ? MONTHS.indexOf(matches[0]!) + 1 : null;
}

/**
 * Lenient month-word matching — used only in year+month(+day) context
 * (`@2027 j` → January), where the frozen UX's own example resolves a
 * single, genuinely-ambiguous-by-prefix letter ("j" also prefixes
 * June/July) to January specifically. First calendar-order match wins,
 * deterministically — the smallest rule that reproduces the given example
 * without inventing an unspecified tie-break. Intentionally a different,
 * more permissive rule than `classifyMonthStrict`'s — the year already
 * signals deliberate intent the standalone-month form doesn't have.
 */
function classifyMonthLenient(token: string): number | null {
  const lower = token.toLowerCase();
  if (lower.length === 0) {
    return null;
  }
  const index = MONTHS.findIndex((month) => month.name.startsWith(lower));
  return index === -1 ? null : index + 1;
}

function formatMonthDayYearLabel(month: number, day: number, year: number): string {
  return `${MONTHS[month - 1]!.label} ${day}, ${year}`;
}

function formatTimeLabel(hour: number, minute: number, meridiem: 'am' | 'pm'): string {
  const mm = String(minute).padStart(2, '0');
  return `Today ${hour}:${mm} ${meridiem === 'am' ? 'AM' : 'PM'}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Constructs a `Date` from numeric components using the safe local-getter
 * round-trip, reusing `isValidCalendarDate` (rather than reimplementing
 * its rollover-rejection check) — never `new Date(isoString)`, per the
 * already-documented UTC-parsing trap (`resolveDate.ts`'s own comment).
 * Returns `null` on rollover (e.g. day 31 in a 30-day month) instead of
 * the nearby valid-but-wrong date `Date`'s constructor would otherwise
 * silently produce.
 */
function buildValidLocalDate(year: number, month: number, day: number): Date | null {
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isValidCalendarDate(candidate)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/**
 * The next occurrence of `month`/`day`, on or after today. Tries this
 * year, then next year, then gives up (returns `null`) rather than
 * searching indefinitely — sufficient for every case the frozen UX
 * specifies; a leap-day month/day whose next valid occurrence is more than
 * one year out (e.g. today just after Feb 29 in a leap year) intentionally
 * yields no result rather than skipping several years, consistent with
 * "never silently roll a date."
 */
function nextOccurrence(referenceDate: Date, month: number, day: number): Date | null {
  const today = startOfDay(referenceDate);
  const year = referenceDate.getFullYear();

  const thisYear = buildValidLocalDate(year, month, day);
  if (thisYear && thisYear.getTime() >= today.getTime()) {
    return thisYear;
  }

  return buildValidLocalDate(year + 1, month, day);
}

/** `1`–`12`, optional `:mm`, optional `am`/`pm`/`a`/`p` suffix — matches every time example in the frozen UX. Hours outside 1–12 (bare `@23`, etc.) are intentionally out of scope: rule 3 only defines a bare number as time, it does not define a 24-hour grammar. */
function parseTimeToken(token: string): { hour: number; minute: number; meridiem: 'am' | 'pm' } | null {
  const match = /^([1-9]|1[0-2])(?::([0-5][0-9]))?(am|pm|a|p)?$/i.exec(token);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3]?.toLowerCase();

  let meridiem: 'am' | 'pm';
  if (suffix === 'am' || suffix === 'a') {
    meridiem = 'am';
  } else if (suffix === 'pm' || suffix === 'p') {
    meridiem = 'pm';
  } else {
    // No explicit suffix: 12 defaults to noon (PM), 1–11 default to AM —
    // directly per the frozen UX's own examples (@12 → PM, @1 → AM).
    meridiem = hour === 12 ? 'pm' : 'am';
  }

  return { hour, minute, meridiem };
}

/**
 * `YYYY-MM-DD` (exact, echoed back verbatim as its own label — preserves
 * the pre-existing behavior/tests for a fully-typed ISO date) or
 * `YYYY-MM` (explicitly no result, per the frozen UX: "@2027-08 → NO
 * result" — unlike the space-separated "year month" form, the dashed
 * fragment does not default to day 1). Any other dash-containing shape
 * (`2026-`, `2026-08-`) is a partial with nothing to complete to.
 */
function resolveIsoFragment(token: string): DateQueryResult | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (full) {
    const built = buildValidLocalDate(Number(full[1]), Number(full[2]), Number(full[3]));
    return built ? { isoDate: token, label: token } : null;
  }

  return null;
}

function resolveSingleToken(token: string, referenceDate: Date): DateQueryResult | null {
  if (token.includes('-')) {
    return resolveIsoFragment(token);
  }

  // A bare 4-digit year alone is not meaningful enough (rule 6).
  if (/^\d{4}$/.test(token)) {
    return null;
  }

  const time = parseTimeToken(token);
  if (time) {
    return {
      isoDate: toISODate(startOfDay(referenceDate)),
      label: formatTimeLabel(time.hour, time.minute, time.meridiem),
    };
  }

  if (/^[A-Za-z]+$/.test(token)) {
    const month = classifyMonthStrict(token);
    if (month === null) {
      return null;
    }
    const resolved = nextOccurrence(referenceDate, month, referenceDate.getDate());
    if (!resolved) {
      return null;
    }
    return {
      isoDate: toISODate(resolved),
      label: formatMonthDayYearLabel(month, resolved.getDate(), resolved.getFullYear()),
    };
  }

  return null;
}

function resolveMonthDayPair(monthToken: string, dayToken: string, referenceDate: Date): DateQueryResult | null {
  const month = classifyMonthStrict(monthToken);
  if (month === null || !/^\d{1,2}$/.test(dayToken)) {
    return null;
  }

  const resolved = nextOccurrence(referenceDate, month, Number(dayToken));
  if (!resolved) {
    return null;
  }
  return {
    isoDate: toISODate(resolved),
    label: formatMonthDayYearLabel(month, resolved.getDate(), resolved.getFullYear()),
  };
}

function resolveTwoTokens(a: string, b: string, referenceDate: Date): DateQueryResult | null {
  // year + month-word (literal order only — "no arbitrary permutations").
  if (/^\d{4}$/.test(a) && /^[A-Za-z]+$/.test(b)) {
    const month = classifyMonthLenient(b);
    if (month === null) {
      return null;
    }
    const year = Number(a);
    const built = buildValidLocalDate(year, month, 1);
    return built ? { isoDate: toISODate(built), label: formatMonthDayYearLabel(month, 1, year) } : null;
  }

  // day + month, either order.
  if (/^[A-Za-z]+$/.test(a) && /^\d{1,2}$/.test(b)) {
    return resolveMonthDayPair(a, b, referenceDate);
  }
  if (/^\d{1,2}$/.test(a) && /^[A-Za-z]+$/.test(b)) {
    return resolveMonthDayPair(b, a, referenceDate);
  }

  return null;
}

/** year + month + day, literal order only — the one 3-token form the frozen UX defines. */
function resolveThreeTokens(a: string, b: string, c: string): DateQueryResult | null {
  if (!/^\d{4}$/.test(a) || !/^\d{1,2}$/.test(c)) {
    return null;
  }
  const month = classifyMonthLenient(b);
  if (month === null) {
    return null;
  }

  const year = Number(a);
  const day = Number(c);
  const built = buildValidLocalDate(year, month, day);
  return built ? { isoDate: toISODate(built), label: formatMonthDayYearLabel(month, day, year) } : null;
}

/**
 * `query` is the raw text after `@` — relative-keyword matching (`Today`/
 * `Tomorrow`/`Yesterday`) is handled by the caller (`dateSuggestion.ts`)
 * before this is ever invoked; this function only ever sees the remaining
 * grammar (time / month / day+month / year+month(+day) / ISO date).
 */
export function resolveDateQuery(query: string, referenceDate: Date = new Date()): DateQueryResult | null {
  const trimmed = query.trim();
  if (trimmed === '' || /\s{2,}/.test(trimmed)) {
    return null;
  }

  const tokens = trimmed.split(' ');
  if (tokens.length > MAX_DATE_QUERY_TOKENS) {
    return null;
  }

  if (tokens.length === 1) {
    return resolveSingleToken(tokens[0]!, referenceDate);
  }
  if (tokens.length === 2) {
    return resolveTwoTokens(tokens[0]!, tokens[1]!, referenceDate);
  }
  return resolveThreeTokens(tokens[0]!, tokens[1]!, tokens[2]!);
}
