import { DailyNote } from '../models/DailyNote';

type MonthGroups = {
  [date: string]: DailyNote[];
};

export function groupByMonth(dailyNotes: DailyNote[]): MonthGroups {
  return dailyNotes.reduce((groups, dailyNote) => {
    const month = dailyNote.date.slice(0, 7);

    if (!groups[month]) {
      groups[month] = [];
    }
    groups[month].push(dailyNote);

    return groups;
  }, {} as MonthGroups);
}
