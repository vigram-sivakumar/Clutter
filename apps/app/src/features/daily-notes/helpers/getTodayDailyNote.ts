import { DailyNote } from '../models/DailyNote';
import { isToday } from './isToday';

/**
 * Returns today's daily note if it exists
 * Otherwise returns null.
 */
export function getTodayDailyNote(notes: DailyNote[]): DailyNote | null {
  // Look through every daily note.
  // The first note whose date is today is returned.
  const todayNote = notes.find((note) => isToday(note.date));
  // If no note was found, return null.
  return todayNote ?? null;
}
