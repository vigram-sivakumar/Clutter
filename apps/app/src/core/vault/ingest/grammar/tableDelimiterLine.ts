/** Matches the delimiter-row shape used by Lezer's GFM Table extension.
 * This is a lexical guard for competing Clutter block extensions, not a
 * table parser. Lezer still decides whether the header and row form a table.
 */
export function isTableDelimiterLine(text: string): boolean {
  return /^\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/.test(text.trim());
}
