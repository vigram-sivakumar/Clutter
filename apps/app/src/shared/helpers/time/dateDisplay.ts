import type { ISODate } from './types';

/**
 * The single source of truth for every user-visible "rendered date label"
 * in Clutter — the `@date` at-rest widget, task due dates, and Daily Note
 * titles all resolve through this one classification + formatting rule
 * instead of each keeping its own relative-label-else-short-date logic.
 *
 * Deliberately separate from `getDateSuggestions`/`resolveDateQuery`
 * (`features/markdown/editor/codemirror/date/`) — those compute
 * autocomplete *suggestion* labels ("Today", "March 12, 2027") for a
 * query still being typed; this formats an *already-resolved* date for
 * display. The two never share code, on purpose: a suggestion label and a
 * rendered label answer different questions, and conflating them was
 * exactly the kind of "second, competing" logic this module exists to
 * avoid introducing elsewhere.
 *
 * Three presentation modes share one underlying date-relationship
 * classification (today / tomorrow / yesterday / another day this week /
 * outside this week) *and* one "day identity" label derived from it
 * (Today/Tomorrow/Yesterday, else the date's weekday name — always
 * defined, not only for dates within the current week) — only the
 * surrounding text (and, for `'condensed'`, the month-name length)
 * differs:
 * - `'compact'` — for space-constrained inline rendering (`@date`'s
 *   Markdown token): the bare day-identity word *only* within the
 *   current week (`Today`, `Friday`, ...); outside it, no weekday name
 *   at all — just `12 August 2026` (full month name, year always shown).
 * - `'condensed'` — for a narrower list surface (the Tasks sidebar):
 *   identical day-identity behavior to `'compact'`, but the "outside the
 *   current week" fallback uses an abbreviated month name — `12 Aug 2026`
 *   — since a sidebar row has less room than an inline `@date` token. The
 *   date *relationship* logic (today/tomorrow/weekday/other) is not
 *   duplicated for this — only which month-label table gets used in the
 *   final string.
 * - `'full'` — for a title-sized surface (Daily Note titles): always
 *   `"<day identity>, <day month year>"` — e.g. `"Today, 20 August 2026"`,
 *   `"Friday, 21 August 2026"`, and, unlike the other two modes, still
 *   `"Thursday, 12 August 2027"` even for a date outside the current
 *   week/year — the day identity is never dropped in this mode, and the
 *   year is never omitted either. A title has the room a `@date` token
 *   or a sidebar row doesn't.
 */
export type DateDisplayMode = 'compact' | 'condensed' | 'full';

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Only used by `'condensed'` mode's "outside the current week" fallback. */
const MONTH_LABELS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses `YYYY-MM-DD` into a local-midnight `Date` via numeric-component
 * construction — never `new Date(isoString)`. That form is parsed as
 * **UTC** midnight per spec, which would silently disagree with every
 * local-getter-based comparison below (the same already-documented trap
 * `resolveDate.ts` and the Date autocomplete resolver both work around).
 */
function parseISODate(isoDate: ISODate): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

interface DateRelation {
  /**
   * `'weekday'` vs `'other'` only matters to `'compact'` mode (whether the
   * bare weekday name alone is enough, or the date needs to be spelled
   * out) — `'full'` mode treats both identically via `dayIdentityLabel`.
   */
  readonly kind: 'today' | 'tomorrow' | 'yesterday' | 'weekday' | 'other';
  /** The date's weekday name — always populated, regardless of `kind`. */
  readonly weekdayLabel: string;
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/**
 * Classifies `isoDate` relative to `referenceDate`'s local calendar day.
 * "Current week" is Sunday-start, the same convention
 * `shared/helpers/time/math.ts`'s `startOfWeek`/`endOfWeek` already use
 * (`getDay()`-based) — reimplemented here against a safely-constructed
 * local `Date` rather than calling those directly, since they route
 * through the UTC-unsafe `toDate()` internally.
 */
function classify(isoDate: ISODate, referenceDate: Date): DateRelation {
  const date = parseISODate(isoDate);
  const today = startOfLocalDay(referenceDate);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const weekdayLabel = WEEKDAY_LABELS[date.getDay()]!;

  const diffDays = Math.round((date.getTime() - today.getTime()) / MS_PER_DAY);

  if (diffDays === 0) {
    return { kind: 'today', weekdayLabel, day, month, year };
  }
  if (diffDays === 1) {
    return { kind: 'tomorrow', weekdayLabel, day, month, year };
  }
  if (diffDays === -1) {
    return { kind: 'yesterday', weekdayLabel, day, month, year };
  }

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const kind = date.getTime() >= weekStart.getTime() && date.getTime() <= weekEnd.getTime() ? 'weekday' : 'other';
  return { kind, weekdayLabel, day, month, year };
}

/**
 * The "day identity" both presentation modes share: Today/Tomorrow/
 * Yesterday when applicable, otherwise the date's weekday name — defined
 * for every date, not only one within the current week. `'compact'` mode
 * only *uses* this for `kind !== 'other'`; `'full'` mode always uses it.
 */
function dayIdentityLabel(relation: DateRelation): string {
  switch (relation.kind) {
    case 'today':
      return 'Today';
    case 'tomorrow':
      return 'Tomorrow';
    case 'yesterday':
      return 'Yesterday';
    case 'weekday':
    case 'other':
      return relation.weekdayLabel;
  }
}

/**
 * Formats `isoDate` for display, per `mode` — see this module's own doc
 * comment for the exact rules. `referenceDate` defaults to real local
 * "now"; a parameter only so callers/tests can pin it, same convention
 * `getDateSuggestions` already uses.
 */
export function formatDateDisplay(
  isoDate: ISODate,
  mode: DateDisplayMode,
  referenceDate: Date = new Date()
): string {
  const relation = classify(isoDate, referenceDate);
  const monthLabels = mode === 'condensed' ? MONTH_LABELS_SHORT : MONTH_LABELS;
  const monthLabel = monthLabels[relation.month - 1]!;
  const fullDate = `${relation.day} ${monthLabel} ${relation.year}`;

  if (mode === 'full') {
    return `${dayIdentityLabel(relation)}, ${fullDate}`;
  }

  if (relation.kind !== 'other') {
    return dayIdentityLabel(relation);
  }

  return fullDate;
}
