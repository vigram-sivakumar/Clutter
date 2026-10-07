import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

import { scanWikiLink } from './wikiLinkScanner';

const OPEN_BRACKET = '['.charCodeAt(0);

/**
 * The `WikiLink` Lezer node, registered through `@lezer/markdown`'s public
 * `MarkdownConfig` extension mechanism — the same mechanism GFM's own
 * Table/TaskList/Strikethrough/Autolink extensions use. `before: "Link"`
 * plus the scanner's own continuation-lookahead (see wikiLinkScanner.ts)
 * together guarantee a genuine CommonMark link like `[[Project A]](url)`
 * is never stolen — confirmed empirically in the §4.0 spike, not assumed
 * from the type signature.
 *
 * All parsing decisions (escaping, the separator/closer rules, the
 * all-or-nothing fallback) live in the pure scanner; this file's only job
 * is translating between Lezer's position/return-value contract and that
 * scanner's plain-string contract.
 */
export const wikiLinkSyntax: MarkdownConfig = {
  defineNodes: ['WikiLink'],
  parseInline: [
    {
      name: 'WikiLink',
      before: 'Link',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== OPEN_BRACKET || cx.char(pos + 1) !== OPEN_BRACKET) {
          return -1;
        }

        const match = scanWikiLink(cx.slice(pos, cx.end), 0);
        if (!match) {
          return -1;
        }

        return cx.addElement(cx.elt('WikiLink', pos, pos + match.end));
      },
    },
  ],
};
