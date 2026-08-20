import type { ISODate } from '../types';

/**
 * Converts an ISO date (`YYYY-MM-DD`) to a local-midnight `Date` object, via
 * numeric-component construction (`new Date(y, m - 1, d)`) — never
 * `new Date(isoString)`. That form is parsed as **UTC** midnight per spec,
 * which silently disagrees with every local-getter-based comparison in
 * `compare.ts`/`math.ts`/`format.ts` that consume this function's result:
 * in any negative-UTC-offset timezone, `new Date("2026-01-01")` evaluates to
 * "2025-12-31, evening, local time," which was flipping `isPast`/`isToday`
 * classification for dates near the local day boundary (see
 * `dateDisplay.ts`'s `parseISODate` and `resolveDate.ts`, which already used
 * this same safe construction independently).
 */
export function toDate(date: ISODate) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}
