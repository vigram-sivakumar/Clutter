import { BARE_DATE_PATTERN } from '@core/vault/ingest/extractors/TaskExtractor';

/**
 * Prepares a task's `text` for display as the Tasks sidebar row title's
 * raw Markdown source: hides the one bare `@YYYY-MM-DD` occurrence that
 * produced `dueDate` — the trailing due-date badge (`formatTaskDueDate`)
 * already renders that same date, so leaving it inline too would show it
 * twice (see `renderTaskRow`) — and leaves everything else in `text`
 * completely untouched: every other bare date, and any other Markdown
 * syntax (`**bold**`, `[[WikiLink]]`, `#tag`, ...).
 *
 * This is now the *only* thing this function does — reformatting the
 * remaining dates and rendering bold/italic/strikethrough/code/WikiLinks/
 * tags is `renderCompactMarkdown`'s job (it tokenizes with the same
 * grammar the page editor uses), not duplicated here. Which bare-date
 * occurrence is *the* due date is the one piece of genuinely task-specific
 * business logic this function still owns.
 *
 * Reuses `TaskExtractor`'s own `BARE_DATE_PATTERN` (widened with the `g`
 * flag to walk every occurrence) rather than a second copy of the
 * bare-date shape — same non-duplication precedent `TaskExtractor.ts`
 * already documents for `dateScanner.ts`/`tagScanner.ts`, just one level
 * further down.
 *
 * Matches the due-date occurrence by *value*, not position —
 * `TaskExtractor` picks `dueDate` as the first bare date in text when no
 * `@due:` is present, but a task can carry more than one bare date
 * ("moved from @2026-08-01 to @2026-08-22"). Only the first occurrence
 * whose value equals `dueDate` is hidden; every other date mentioned in
 * the text — including a later occurrence of the same date value, an
 * edge case `TaskExtractor`'s own "first date wins" rule already implies
 * is *not* the due date — stays visible, untouched. When `dueDate` came
 * from `@due:` instead (already stripped from `text` at extraction) or no
 * bare date matches it at all, `text` is returned unchanged.
 */
export function formatTaskTitle(text: string, dueDate: string | undefined): string {
  if (dueDate === undefined) {
    return text;
  }

  const pattern = new RegExp(BARE_DATE_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match[2] === dueDate) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      // Hidden entirely — leading whitespace and the raw token both drop,
      // same as before.
      return (text.slice(0, matchStart) + text.slice(matchEnd)).trim().replace(/ {2,}/g, ' ');
    }
  }

  return text;
}
