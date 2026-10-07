import type { InlineContext, MarkdownConfig } from '@lezer/markdown';

import { isValidDatePrecedingContext, scanDate } from './dateScanner';

const AT = '@'.charCodeAt(0);

/**
 * The `Date` Lezer node — the first construct in the `@`-family (locked in
 * docs/editor-architecture-decisions.md's `@Today`/relative-date entries,
 * which already anticipated one shared `@`-triggered inline-parser
 * function disambiguating multiple kinds). Registered through the same
 * public `MarkdownConfig` mechanism `wikiLinkSyntax.ts`/`tagSyntax.ts` use.
 *
 * No `before`/`after` ordering needed — nothing else in CommonMark/GFM
 * claims a bare `@` inside inline content (Autolink's own email form
 * requires content *before* the `@`, a structurally different match
 * position, not a competing claim on this one).
 *
 * Context-free by construction: this parser never inspects surrounding
 * block context (task checkbox or not) to decide whether `@2026-08-20` is
 * a `Date` node — it always is. Task-due-date semantics are assembled
 * entirely downstream, by `TaskExtractor.ts` (a different layer, a
 * different parser), never by this grammar branching on it.
 *
 * Only ever sees a shape-valid date text (`scanDate`'s job); calendar
 * validity is a separate, later concern — see `dateScanner.ts`'s own
 * comment for the parse-vs-validate reasoning.
 */
export const dateSyntax: MarkdownConfig = {
  defineNodes: ['Date'],
  parseInline: [
    {
      name: 'Date',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== AT) {
          return -1;
        }

        // Mirrors tagSyntax.ts's own reasoning exactly: cx.slice/cx.char
        // cannot see before this inline context's own `offset` (confirmed
        // empirically against @lezer/markdown — a block boundary, not
        // just "no character"), so `pos <= cx.offset` is treated as valid
        // start context unconditionally, correct for the start of every
        // block, not only the document's first line.
        const before = pos > cx.offset ? cx.slice(pos - 1, pos) : undefined;
        if (!isValidDatePrecedingContext(before)) {
          return -1;
        }

        const match = scanDate(cx.slice(pos, cx.end), 0);
        if (!match) {
          return -1;
        }

        return cx.addElement(cx.elt('Date', pos, pos + match.end));
      },
    },
  ],
};
