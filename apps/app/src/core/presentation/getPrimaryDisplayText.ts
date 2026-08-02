// Strips a small set of common leading markdown syntax markers so a
// heading, list item, task checkbox, or blockquote reads as plain text
// rather than showing its raw syntax in a preview label.
const LEADING_SYNTAX_PATTERN = /^(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|>\s+)/;

/**
 * Extracts the first non-trivial line of a page's body, for use as a
 * fallback display label when no deliberate title or description exists.
 *
 * Deliberately simple for v1 — skips blank lines and strips a handful of
 * leading markdown markers, nothing more (no callout awareness, no
 * completed-task filtering, no cross-referencing page.analysis). This is
 * its own named, independently-evolvable rule specifically so those
 * refinements can be added later without any caller (getPageDisplayLabel,
 * or anything else) needing to change.
 */
export function getPrimaryDisplayText(markdown: string): string | null {
  for (const rawLine of markdown.split('\n')) {
    const stripped = rawLine.replace(LEADING_SYNTAX_PATTERN, '').trim();

    if (stripped.length > 0) {
      return stripped;
    }
  }

  return null;
}
