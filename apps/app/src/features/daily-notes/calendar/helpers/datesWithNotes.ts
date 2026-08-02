import type { Page } from '@core/vault/models/Page';

/**
 * The set of ISO dates that already have a persisted daily note. A daily
 * note's `name` is already its ISO date string (DailyNotePath's filename
 * convention), so no parsing is needed here.
 */
export function datesWithNotes(dailyNotes: Page[]): Set<string> {
  return new Set(dailyNotes.map((note) => note.name));
}
