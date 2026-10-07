import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

import { scanBareDomain } from './bareDomainScanner';

function isAsciiAlphanumericCode(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * The `BareDomain` Lezer inline parser — registered through the same
 * public `MarkdownConfig` mechanism `dateSyntax.ts`/`tagSyntax.ts`/
 * `wikiLinkSyntax.ts` use. Deliberately defines **no new node**: on a
 * match it emits the existing `URL` node (`cx.elt('URL', ...)`), the same
 * node `@lezer/markdown`'s own `Autolink` extension already produces for
 * `https://`/`www.`-prefixed text — so rendering (`urlRenderer`), click
 * activation (`urlActivation.ts`/`urlEngagement.ts`'s `isUrlNode`), and
 * navigation (`openExternalUrl.ts`'s scheme-less `https://` resolution)
 * all apply to a bare-domain match automatically, with zero changes to
 * any of those files — they already operate generically on the Lezer node
 * name `URL`, not on how it was produced.
 *
 * `after: 'Autolink'` (a named-parser ordering reference resolved by
 * `MarkdownParser.configure()`, not by this array's position in
 * `markdownGrammarExtensions.ts`) means `Autolink`'s own parser always
 * gets first refusal at every position — since a successful match
 * advances `@lezer/markdown`'s per-character dispatch loop past the whole
 * claimed span (`pos = result; continue outer`), this parser never even
 * runs on any character inside text `Autolink` already claimed
 * (`https://…`, `http://…`, `www….`). `[label](destination)` Link
 * destinations are a separate code path entirely (`finishLink`/`parseURL`,
 * never routed through this per-character `parseInline` dispatch loop at
 * all) — confirmed during the design investigation, not assumed — so this
 * parser structurally cannot affect `[text](./relative/path)`-style Link
 * destinations, Markdown source, or `Autolink`'s own behavior.
 *
 * The word-boundary guard below (`pos > 0 && /\w/.test(...)`) is the
 * literal same check `@lezer/markdown`'s own `Autolink.parse` uses on its
 * preceding character — reused verbatim for consistency between the two
 * "extend an existing at-rest word into a URL" parsers, rather than the
 * stricter whitespace-or-start rule `Tag`/`Date` use (those are
 * `#`/`@`-triggered constructs with different product boundaries; a
 * domain commonly follows ordinary punctuation, e.g. `(google.com)` or
 * `see:google.com`, which `Autolink` itself already allows).
 */
export const bareDomainSyntax: MarkdownConfig = {
  parseInline: [
    {
      name: 'BareDomain',
      after: 'Autolink',
      parse(cx: InlineContext, next: number, absPos: number): number {
        if (!isAsciiAlphanumericCode(next)) {
          return -1;
        }

        const pos = absPos - cx.offset;
        if (pos > 0 && /\w/.test(cx.text[pos - 1] ?? '')) {
          return -1;
        }

        const match = scanBareDomain(cx.text, pos);
        if (!match) {
          return -1;
        }

        const end = match.end + cx.offset;
        cx.addElement(cx.elt('URL', absPos, end));
        return end;
      },
    },
  ],
};
