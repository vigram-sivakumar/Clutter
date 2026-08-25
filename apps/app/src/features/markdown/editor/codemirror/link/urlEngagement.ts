import type { TokenNodeRange } from '../semanticToken/tokenEngagement';

export type UrlNodeRange = TokenNodeRange;

/**
 * The one URL-family-specific fact the generic semantic-token mechanisms
 * need: which Lezer node names count as a navigable bare-URL occurrence.
 * Matches only `URL` — never `Autolink` itself — so `sliceDoc(from, to)`
 * on the matched range is always the raw URL text with no `<`/`>`
 * stripping required. This covers both a standalone bare URL (which
 * parses as a plain `URL` node with no wrapper) and Autolink's own inner
 * `URL` child (`Autolink > [LinkMark "<", URL, LinkMark ">"]`) — clicking
 * exactly on Autolink's one-character `<`/`>` marks falls outside the
 * `URL` child's range and is not handled, a deliberate, narrow scope cut.
 */
export const isUrlNode = (nodeName: string): boolean => nodeName === 'URL';
