import { formatDailyNotePickerTitle, formatDailyNoteTitle } from './formatDailyNoteTitle';

/**
 * Everything a Daily Note can be searched by: its canonical `YYYY-MM-DD` name, and the two ways
 * the app writes its date — the page title (`Monday, 24 August 2026`) and the list title
 * (`24 Aug`) — straight from `formatDailyNoteTitle`/`formatDailyNotePickerTitle`, so a search
 * can never disagree with what the user sees. The name stays the note's identity (path, link
 * target); this is only text to match a query against, which is why `[[Aug`, `[[August 24` and
 * `[[2026-08-24` all find the same note. Match it with `matchesSearchText`.
 */
export function dailyNoteSearchText(name: string): string {
  return [name, formatDailyNoteTitle(name), formatDailyNotePickerTitle(name)].join(' ');
}
