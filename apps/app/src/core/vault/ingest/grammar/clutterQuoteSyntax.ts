import { tags } from '@lezer/highlight';
import type { BlockContext, Line, MarkdownExtension } from '@lezer/markdown';

const QUOTE_CHAR = 34; // "
const SPACE = 32;

/**
 * Clutter's own quote marker: a double quotation mark followed by one space (`" text`). Both characters are the
 * marker; the space is never part of the quoted text. A quotation mark with anything else after it
 * (`"Hello" she said`), or at the very end of a line, is ordinary text.
 */
export function isClutterQuoteMarker(line: Line): boolean {
  return line.next === QUOTE_CHAR && line.text.charCodeAt(line.pos + 1) === SPACE;
}

function clutterQuoteBlock(cx: BlockContext, line: Line): boolean | null {
  if (!isClutterQuoteMarker(line)) {
    return false;
  }
  const from = cx.lineStart + line.pos;
  cx.startComposite('ClutterQuote', line.pos);
  cx.addElement(cx.elt('QuoteMark', from, from + 1));
  line.moveBase(line.pos + 2);
  return null;
}

/** Whether a later line still belongs to the quote: it carries its own `" ` marker. */
function clutterQuoteComposite(cx: BlockContext, line: Line): boolean {
  if (!isClutterQuoteMarker(line)) {
    return false;
  }
  const from = cx.lineStart + line.pos;
  line.markers.push(cx.elt('QuoteMark', from, from + 1));
  line.moveBase(line.pos + 2);
  return true;
}

/**
 * What ends a paragraph: a new `" ` line interrupts it (as `>` does), and — unlike a `>` quote — a line *without*
 * the marker ends a paragraph inside a Clutter quote instead of lazily joining it. Every quote line carries its own
 * marker, so leaving the quote never needs a blank line in the source.
 */
function endsLeafForClutterQuote(cx: BlockContext, line: Line): boolean {
  if (isClutterQuoteMarker(line)) {
    return true;
  }
  // `Line.depth` (how many enclosing composites this line matched) is `@internal` in `@lezer/markdown`'s typings but
  // is what its own paragraph handling reads; the "an unmarked line ends the quote" test fails loudly if it ever moves.
  const matched = (line as Line & { readonly depth: number }).depth;
  return matched < cx.depth && cx.parentType(matched).name === 'ClutterQuote';
}

/**
 * `ClutterQuote`: Clutter's native quote block (`" text`). A separate node from `Blockquote` because `@lezer/markdown`
 * keys a composite's continuation rule to its node type and ignores a second definition of an existing name; the
 * marker reuses the existing `QuoteMark` node, so marker concealment and the quote bar need no new marker type.
 * Stored in the vault as typed; `core/.../toStandardMarkdown` rewrites it to `>` for other tools.
 */
export const clutterQuoteSyntax: MarkdownExtension = {
  defineNodes: [{ name: 'ClutterQuote', block: true, composite: clutterQuoteComposite, style: tags.quote }],
  parseBlock: [
    {
      name: 'ClutterQuote',
      parse: clutterQuoteBlock,
      endLeaf: endsLeafForClutterQuote,
      after: 'Blockquote',
    },
  ],
};
