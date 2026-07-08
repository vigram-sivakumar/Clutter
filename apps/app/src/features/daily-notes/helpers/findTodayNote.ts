import { isToday } from '@shared/helpers/time';
import { DailyNote } from '../models/DailyNote';

export function findTodayNote(notes: DailyNote[]): DailyNote | null {
  return notes.find((note) => isToday(note.date)) ?? null;
}
