// Strips a small set of common leading markdown syntax markers so a
// heading, list item, task checkbox, or blockquote reads as plain text
// rather than showing its raw syntax in a preview label.
const LEADING_SYNTAX_PATTERN = /^(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|>\s+)/;

/**
 * Extracts the first non-trivial line of a Daily Note's body, for use as
 * a fallback display label when the note has no description yet. Daily
 * Notes always have a date for a filename, never a deliberate title, so
 * their label falls through to description/content well before a regular
 * Note's would — this is that fallback's sole caller (getPageDisplayLabel);
 * regular Notes no longer derive a label from body content at all.
 *
 * Deliberately simple for v1 — skips blank lines and strips a handful of
 * leading markdown markers, nothing more (no callout awareness, no
 * completed-task filtering, no cross-referencing page.analysis).
 */
export function getDailyNotePrimaryDisplayText(markdown: string): string | null {
  for (const rawLine of markdown.split('\n')) {
    const stripped = rawLine.replace(LEADING_SYNTAX_PATTERN, '').trim();

    if (stripped.length > 0) {
      return stripped;
    }
  }

  return null;
}
