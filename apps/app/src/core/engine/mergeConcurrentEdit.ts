import { minimalReplaceChange } from './minimalReplace';

/**
 * Combines two edits made to the same `base` text at once: `local` (what the editor produced from it) and
 * `remote` (what the session holds now, because something else wrote the document before the editor was told).
 *
 * Both edits are reduced to one localized change (`minimalReplaceChange`). When they touch different parts of
 * the text — one ends where or before the other begins — both are kept. Inserts at the very same position keep
 * the remote one first. When they overlap there is no honest merge, and the local text wins: exactly what
 * committing the editor's text did before this existed, so a conflict is never worse than the old behavior.
 *
 * Used only when the session has moved past the text the editor started from (see `commitEdit`'s `basedOn`);
 * in ordinary typing `base === remote` and this is never called.
 */
export function mergeConcurrentEdit(base: string, local: string, remote: string): string {
  const mine = minimalReplaceChange(base, local);
  const theirs = minimalReplaceChange(base, remote);

  if (theirs.to <= mine.from) {
    // The external change lies wholly before the local one: keep it, shift the local change past it.
    const shift = theirs.insert.length - (theirs.to - theirs.from);

    return (
      remote.slice(0, mine.from + shift) + mine.insert + remote.slice(mine.to + shift)
    );
  }

  if (mine.to <= theirs.from) {
    // The local change lies wholly before the external one: keep it, shift the external change past it.
    const shift = mine.insert.length - (mine.to - mine.from);

    return (
      local.slice(0, theirs.from + shift) + theirs.insert + local.slice(theirs.to + shift)
    );
  }

  return local;
}
