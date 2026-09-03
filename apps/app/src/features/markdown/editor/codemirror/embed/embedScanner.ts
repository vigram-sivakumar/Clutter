import { scanWikiLink } from '../wikilink/wikiLinkScanner';

export interface EmbedMatch {
  readonly path: string;
  readonly alias: string | null;
  /** Index one past the closing `]]`, within the `text` passed to {@link scanEmbed} — includes the leading `!`. */
  readonly end: number;
}

/**
 * Scans an Embed starting at `startIndex`, which must point at the `!`
 * immediately followed by `[[`. All the interesting parsing — escaping,
 * the alias separator, lazy-close, the continuation-lookahead that defers
 * to a genuine CommonMark Image whose alt text happens to be a doubled
 * bracket (`![[Alt]](url)`) — is delegated entirely to {@link scanWikiLink}
 * against the same `text`/offset-by-one-for-the-`!` position. This is the
 * only new logic Embed needs: recognizing and consuming the leading `!`.
 * Delegating rather than re-implementing means Embed and WikiLink can never
 * drift apart on how the bracketed `[[path|alias]]` portion itself is
 * parsed — one scanner underneath two thin, kind-specific callers.
 *
 * `scanWikiLink`'s own `end` is always an absolute offset within whatever
 * `text` it was given (confirmed by reading its implementation: every
 * position it computes is indexed directly against the input string, never
 * relative to `startIndex`) — so no adjustment is needed here for the
 * leading `!` we consumed; `match.end` already spans the full `!` + `[[...]]`.
 */
export function scanEmbed(text: string, startIndex: number): EmbedMatch | null {
  if (text[startIndex] !== '!') {
    return null;
  }

  const match = scanWikiLink(text, startIndex + 1);
  if (!match) {
    return null;
  }

  return { path: match.path, alias: match.alias, end: match.end };
}
