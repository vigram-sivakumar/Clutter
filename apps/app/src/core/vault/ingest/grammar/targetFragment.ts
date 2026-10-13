/**
 * Splits a link/embed target at its first `#` into the note part and the fragment after it (`null` when
 * there is no `#`). `Note#Heading` and `Note#^block-id` both split here; whether the fragment names a
 * heading or a block (a leading `^`) is the caller's call. Not trimmed: the callers already own that.
 * The one split every target consumer shares — the editor's wiki-link and embed resolvers, the
 * `[[Note#` / `![[Note#` completion, and an embed's source navigation — so none of them treats
 * `#Heading` as part of a file path. Lives with the grammar scanners because the editor may import them.
 */
export function splitTargetFragment(target: string): { readonly pagePart: string; readonly fragment: string | null } {
  const hashIndex = target.indexOf('#');

  return hashIndex === -1
    ? { pagePart: target, fragment: null }
    : { pagePart: target.slice(0, hashIndex), fragment: target.slice(hashIndex + 1) };
}
