import type { Page } from '@core/vault/models/Page';

/**
 * The set of ISO dates that already have a persisted daily note. A daily
 * note's `name` is already its ISO date string (DailyNotePath's filename
 * convention), so no parsing is needed here. Callers pass the Vault's ACTIVE Daily Notes
 * (`Vault.dailyNotes()`), which leaves out everything inside `Archive/` — an archived Daily Note (still a
 * Daily Note, see ADR-042) doesn't make its day "have a note".
 */
export function datesWithNotes(dailyNotes: Page[]): Set<string> {
  return new Set(dailyNotes.map((note) => note.name));
}
