import { tags } from '@lezer/highlight';
import type { DelimiterType, InlineContext, MarkdownConfig } from '@lezer/markdown';

const LESS_THAN = '<'.charCodeAt(0);

const UnderlineDelim: DelimiterType = { resolve: 'Underline', mark: 'UnderlineMark' };

/** `<u>` opens, `</u>` closes (HTML tag names are case-insensitive). Nothing else after the name: `<u class>` is not ours. */
const OPEN_TAG = /^<u>/i;
const CLOSE_TAG = /^<\/u>/i;

/**
 * Underline, stored as the inline HTML `<u>text</u>` — what CommonMark itself defines for it, so the saved file
 * renders as underline in any Markdown renderer that allows inline HTML. (`__text__` is bold in Markdown, so it is
 * not used.) Registered like `Highlight`: the two tags are delimiters resolved into one `Underline` node with an
 * `UnderlineMark` at each end, so it nests with bold, italic, links and the rest through the one generic mechanism.
 *
 * Runs before `@lezer/markdown`'s own `HTMLTag` parser, which would otherwise claim `<u>` and `</u>` as two
 * unrelated tags. An unpaired `<u>` stays an ordinary, unmatched delimiter (plain text), exactly as an unpaired `**`
 * does. Code spans, fenced code and escapes are parsed first or elsewhere, so a `<u>` inside them stays literal.
 */
export const underlineSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'Underline' },
    // Same generic punctuation-mark tag every other construct's mark node uses.
    { name: 'UnderlineMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Underline',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== LESS_THAN) {
          return -1;
        }
        const ahead = cx.slice(pos, pos + 4);
        if (OPEN_TAG.test(ahead)) {
          return cx.addDelimiter(UnderlineDelim, pos, pos + 3, true, false);
        }
        if (CLOSE_TAG.test(ahead)) {
          return cx.addDelimiter(UnderlineDelim, pos, pos + 4, false, true);
        }
        return -1;
      },
      before: 'HTMLTag',
    },
  ],
};
