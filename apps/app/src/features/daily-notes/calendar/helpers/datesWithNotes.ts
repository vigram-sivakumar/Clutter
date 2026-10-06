import type { Page } from '@core/vault/models/Page';

/**
 * The set of ISO dates that already have a persisted daily note. A daily
 * note's `name` is already its ISO date string (DailyNotePath's filename
 * convention), so no parsing is needed here. A Daily Note in the Trash (still a Daily Note, see
 * ADR-042) doesn't make its day "have a note".
 */
export function datesWithNotes(dailyNotes: Page[]): Set<string> {
  return new Set(
    dailyNotes.filter((note) => note.metadata.status !== 'archived').map((note) => note.name)
  );
}
