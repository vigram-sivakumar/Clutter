import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

import { isValidTagPrecedingContext, scanTag } from './tagScanner';

const HASH = '#'.charCodeAt(0);

/**
 * The `Tag` Lezer node, registered through `@lezer/markdown`'s public
 * `MarkdownConfig` extension mechanism — the same mechanism `wikiLinkSyntax.ts`
 * and GFM's own Table/TaskList/Strikethrough/Autolink extensions use.
 *
 * No `before`/`after` ordering is needed: unlike WikiLink (which shares its
 * `[[` trigger prefix with CommonMark's `[` link syntax), nothing else in
 * CommonMark/GFM ever claims a bare `#` inside inline content. `# Heading`
 * vs. `#tag` needs no disambiguation logic here either — CommonMark's own
 * space-required rule for ATX headings means a `#` immediately followed by
 * a space is already claimed by the block-level `ATXHeading` parser before
 * inline parsing ever runs on that line at all (locked in
 * docs/editor-architecture-decisions.md: "`#tag` vs. ATX heading resolves
 * automatically, no extension logic needed"). This parser only ever sees a
 * `#` that survived block-level heading recognition, i.e. one with no
 * following space — so it only has to decide "is this the start of a valid
 * identifier," never "is this actually a heading in disguise."
 *
 * The preceding-character check (`isValidTagPrecedingContext`) is this
 * parser's own responsibility, not something CommonMark gives for free —
 * it's what makes `foo#tag` (not a tag) behave differently from `foo #tag`
 * (is a tag), matching `TagExtractor.ts`'s own `(^|\s)` rule.
 */
export const tagSyntax: MarkdownConfig = {
  defineNodes: ['Tag'],
  parseInline: [
    {
      name: 'Tag',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== HASH) {
          return -1;
        }

        // `cx.slice`/`cx.char` cannot see before this inline context's own
        // `offset` — despite being described as "document-relative
        // positions," they're only backed by this block's own text
        // (confirmed empirically: slicing before `offset` silently returns
        // an empty string via JS's negative-index string slicing, not the
        // previous block's actual trailing character). `pos <= cx.offset`
        // is therefore treated as valid start context unconditionally —
        // correct not just for document start but for the start of every
        // block (a new block always begins a fresh line, so this is
        // exactly the same "start of line" case TagExtractor's `^` covers
        // for a non-first line, just reached a different way).
        const before = pos > cx.offset ? cx.slice(pos - 1, pos) : undefined;
        if (!isValidTagPrecedingContext(before)) {
          return -1;
        }

        const match = scanTag(cx.slice(pos, cx.end), 0);
        if (!match) {
          return -1;
        }

        return cx.addElement(cx.elt('Tag', pos, pos + match.end));
      },
    },
  ],
};
