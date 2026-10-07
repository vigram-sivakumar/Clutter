import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

import { scanEmbed } from './embedScanner';

const BANG = '!'.charCodeAt(0);
const OPEN_BRACKET = '['.charCodeAt(0);

/**
 * The `Embed` Lezer node — `![[path]]`, a distinct node type from
 * `WikiLink`, per the locked architecture decision
 * (docs/editor-architecture-decisions.md: "The same pattern applies
 * identically to a future `![[embed]]` vs. `Image`" — distinct Lezer node
 * types per semantic kind, not a shared generic node, and `before: "Image"`
 * plus a continuation-lookahead check so Embed wins over the native
 * CommonMark Image rule for this exact syntax shape).
 *
 * Registered `before: "Image"`, not `"Link"`: Embed only ever competes with
 * Image (both start matching at `!`), never with Link (which starts at a
 * bare `[`) — WikiLink's own `[[...]]` rule (registered `before: "Link"`)
 * is untouched by this and never fires for an Embed's `[[...]]` portion,
 * because inline parsing dispatches purely on the character *at* the
 * current position: at the position of Embed's own `[[`, the preceding `!`
 * has already been consumed by this rule matching first, so there is no
 * position left at which WikiLink's rule could independently match it.
 *
 * The continuation-lookahead guard (a genuine `![[Alt]](url)` Image whose
 * alt text happens to be a doubled bracket must never be stolen) comes for
 * free from delegating to `scanWikiLink`'s own `after === '(' || after ===
 * '['` check (wikiLinkScanner.ts) via `scanEmbed` — not reimplemented here.
 */
export const embedSyntax: MarkdownConfig = {
  defineNodes: ['Embed'],
  parseInline: [
    {
      name: 'Embed',
      before: 'Image',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (
          next !== BANG ||
          cx.char(pos + 1) !== OPEN_BRACKET ||
          cx.char(pos + 2) !== OPEN_BRACKET
        ) {
          return -1;
        }

        const match = scanEmbed(cx.slice(pos, cx.end), 0);
        if (!match) {
          return -1;
        }

        return cx.addElement(cx.elt('Embed', pos, pos + match.end));
      },
    },
  ],
};
