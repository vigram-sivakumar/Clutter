/**
 * Whether `text` matches a search query: the query appears in it, or — for a query of several
 * words — every word starts some word of it, in any order. So `aug 24` finds `24 August 2026`
 * though the words are the other way round, and `24, 2026` finds it despite the comma; a word
 * must begin a word of the text, so `24` does not match the `2024` inside `3 August 2024`.
 *
 * For text built to be searched (`dailyNoteSearchText`), not for a plain title, whose match stays
 * the simple "contains the query". `normalizedQuery` is trimmed and lower-cased.
 */
export function matchesSearchText(text: string, normalizedQuery: string): boolean {
  const haystack = text.toLowerCase();
  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const words = (value: string) => value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const queryWords = words(normalizedQuery);
  if (queryWords.length < 2) {
    return false;
  }
  const textWords = words(haystack);
  return queryWords.every((queryWord) => textWords.some((word) => word.startsWith(queryWord)));
}
