import { toISODate } from '@shared/helpers/time/helpers/toISODate';

import { resolveDateQuery } from './dateQueryResolver';

/**
 * A candidate offered by Date's own completion source. `isoDate` is the
 * only thing that ever reaches the buffer on acceptance
 * (`dateCompletionSource.ts`'s `apply()`), always as `@${isoDate}`. Never
 * a display-vs-canonical split by *kind* the way WikiLink's create/page
 * suggestions differ — every Date suggestion behaves identically once
 * accepted.
 *
 * `label` is no longer what the popup row itself visibly shows —
 * `dateCompletionRenderer.ts` derives the visible text from `isoDate` via
 * `formatDateDisplay(isoDate, 'full')` (the same call Daily Note titles
 * use) instead, since that always spells out the full calendar date,
 * making a separately-shown ISO value redundant. `label` remains CM6's
 * own `Completion.label` (`dateCompletionSource.ts`) — an internal
 * identifier existing consumers, including this file's own tests, key off
 * to find a specific suggestion among the returned options; `render`
 * fully replaces the DOM CM6 would otherwise build from it, so it never
 * reaches the screen.
 */
export interface DateSuggestion {
  readonly label: string;
  readonly isoDate: string;
}

/**
 * Relative-keyword shorthand — `Today`/`Tomorrow`/`Yesterday` only
 * (locked in docs/editor-architecture-decisions.md: insertion-time
 * shorthand only, never persisted; deliberately excludes `@Monday` and
 * other weekday forms — not decided/locked anywhere, out of v1 scope).
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

/**
 * Date-only internally (per the current v1 scope), but shaped so a future
 * shared `@`-completion boundary only ever needs `(query) => candidates`
 * from any provider — nothing here assumes `@` exclusively means Date.
 *
 * `referenceDate` defaults to `new Date()` (real local "now") — a
 * parameter only so tests can pin it; never computed via UTC math, per
 * the already-locked "today/midnight are local wall-clock concepts" rule
 * (docs/editor-research/clutter-editor-relative-date-semantics.md).
 *
 * Always returns at most one suggestion — the frozen autocomplete UX's
 * core rule ("always prefer ONE result, never a list of possibilities").
 * Two branches, tried in order:
 * - A relative keyword whose label starts with the typed text
 *   (case-insensitive), **first match only** in declared order (Today,
 *   Tomorrow, Yesterday) — "" and "@t" both resolve to Today, not
 *   Today+Tomorrow, even though both are valid prefixes.
 * - Otherwise, `resolveDateQuery` — the small deterministic
 *   time/month/day+month/year+month(+day)/ISO-date grammar. A partial
 *   shape with nothing to complete to (`2026-`, a bare year) offers
 *   nothing — not a bug, no arbitrary-format guessing.
 */
export function getDateSuggestions(
  query: string,
  referenceDate: Date = new Date()
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

  const resolved = resolveDateQuery(trimmed, referenceDate);
  return resolved ? [{ label: resolved.label, isoDate: resolved.isoDate }] : [];
}

export type GetDateSuggestions = (query: string) => readonly DateSuggestion[];
