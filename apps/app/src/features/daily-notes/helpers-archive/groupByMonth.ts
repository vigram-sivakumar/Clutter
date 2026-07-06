import { DailyNote } from '../models/DailyNote';

export interface MonthGroup {
  title: string;
  notes: DailyNote[];
  isCurrentMonth: boolean;
}
export function groupByMonth(notes: DailyNote[]): MonthGroup[] {
  const groups: MonthGroup[] = [];

  for (const note of notes) {
    const date = new Date(note.date);

    const title = date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const today = new Date();
    const isCurrentMonth =
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    const group = groups.find((group) => group.title === title);
    if (group) {
      group.notes.push(note);
    } else {
      groups.push({
        title,
        notes: [note],
        isCurrentMonth,
      });
    }
  }

  return groups;
}
