import { isToday } from '@shared/helpers/time';
import type { Page } from '@core/vault/models';

export function findTodayNote(dailyNotes: Page[]): Page | null {
  return dailyNotes.find((note) => isToday(note.name)) ?? null;
}
