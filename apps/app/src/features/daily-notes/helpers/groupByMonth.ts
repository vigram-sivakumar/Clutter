import type { Page } from '@core/vault/models';

type MonthGroups = {
  [date: string]: Page[];
};

export function groupByMonth(dailyNotes: Page[]): MonthGroups {
  return dailyNotes.reduce((groups, dailyNote) => {
    const month = dailyNote.name.slice(0, 7);

    if (!groups[month]) {
      groups[month] = [];
    }
    groups[month].push(dailyNote);

    return groups;
  }, {} as MonthGroups);
}
