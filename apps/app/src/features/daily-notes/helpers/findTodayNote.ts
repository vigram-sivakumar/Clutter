import { DailyNote } from '../models/DailyNote';

export function findTodayNote(notes: DailyNote[]): DailyNote | null {
  const today = new Date().toISOString().slice(0, 10);
  const todayNote = notes.find((note) => note.date === today);

  return todayNote ?? null;
}
