import { BARE_DATE_PATTERN } from '@core/vault/ingest/extractors/TaskExtractor';
import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';

/**
 * Prepares a task's `text` for display as the Tasks sidebar row title:
 *
 * - The one bare `@YYYY-MM-DD` occurrence that produced `dueDate` is
 *   always hidden — the trailing due-date badge (`formatTaskDueDate`)
 *   already renders that same date, so leaving it inline too would show
 *   it twice (see `renderTaskRow`).
 * - Every *other* bare date mentioned in the text is real content the
 *   user wrote and stays visible, but rendered through the same shared
 *   label formatter the at-rest editor `DateWidget` uses (`'compact'`
 *   mode) instead of the raw `@YYYY-MM-DD` shape — `@2026-08-22` becomes
 *   `@Saturday`, `@1 September`, etc.
 *
 * Reuses `TaskExtractor`'s own `BARE_DATE_PATTERN` (widened with the `g`
 * flag to walk every occurrence) rather than a second copy of the
 * bare-date shape — same non-duplication precedent `TaskExtractor.ts`
 * already documents for `dateScanner.ts`/`tagScanner.ts`, just one level
 * further down. And reuses `formatDateDisplay` — the single shared
 * rendered-date-label formatter also used by `formatTaskDueDate` and the
 * editor's `DateWidget` — rather than a second date-formatting
 * implementation. This is presentation-only: `text`/`rawText` and the
 * underlying Markdown are never touched, only the string handed to the
 * `<Task title>` prop.
 *
 * Matches the due-date occurrence by *value*, not position —
 * `TaskExtractor` picks `dueDate` as the first bare date in text when no
 * `@due:` is present, but a task can carry more than one bare date
 * ("moved from @2026-08-01 to @2026-08-22"). Only the first occurrence
 * whose value equals `dueDate` is hidden; every other date mentioned in
 * the text — including a later occurrence of the same date value, an
 * edge case `TaskExtractor`'s own "first date wins" rule already implies
 * is *not* the due date — is rendered visibly instead. When `dueDate`
 * came from `@due:` instead (already stripped from `text` at extraction)
 * or no bare date matches it at all, nothing is hidden and every bare
 * date in the text is simply reformatted.
 */
export function formatTaskTitle(text: string, dueDate: string | undefined): string {
  const pattern = new RegExp(BARE_DATE_PATTERN.source, 'g');

  let result = '';
  let cursor = 0;
  let dueDateHidden = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const leading = match[1] ?? '';
    const dateValue = match[2]!;
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    result += text.slice(cursor, matchStart);

    if (!dueDateHidden && dateValue === dueDate) {
      dueDateHidden = true;
      // Hidden entirely — leading whitespace and the raw token both drop.
    } else {
      result += `${leading}@${formatDateDisplay(dateValue, 'compact')}`;
    }

    cursor = matchEnd;
  }

  result += text.slice(cursor);

  return result.trim().replace(/ {2,}/g, ' ');
}
