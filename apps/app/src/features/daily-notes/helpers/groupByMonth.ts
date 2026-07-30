import type { Page } from '@core/vault/models';

type MonthGroups = {
  [date: string]: Page[];
};

/**
 * Groups daily notes by month (`YYYY-MM` from page name).
 *
 * Sort order:
 * - Months: newest first (Dec → Jan, 2026 → 2000)
 * - Notes within a month: newest day first (30 → 1)
 */
export function groupByMonth(dailyNotes: Page[]): Array<[string, Page[]]> {
  const groups = dailyNotes.reduce((accumulator, dailyNote) => {
    const month = dailyNote.name.slice(0, 7);

    if (!accumulator[month]) {
      accumulator[month] = [];
    }
    accumulator[month].push(dailyNote);

    return accumulator;
  }, {} as MonthGroups);

  for (const notes of Object.values(groups)) {
    notes.sort((a, b) => b.name.localeCompare(a.name));
  }

  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}
