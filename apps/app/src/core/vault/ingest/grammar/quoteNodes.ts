/**
 * The block nodes that are a quote: a standard Markdown `Blockquote` (`> text`) and Clutter's native `ClutterQuote`
 * (`" text`, see `clutterQuoteSyntax.ts`). They share one marker node (`QuoteMark`) and one look, so every consumer
 * that treats "a quote" as a unit — decorations, spacing, indentation, the renderers — asks this one question rather
 * than naming `Blockquote` itself.
 */
export const QUOTE_NODE_NAMES: ReadonlySet<string> = new Set(['Blockquote', 'ClutterQuote']);

export function isQuoteNodeName(name: string): boolean {
  return QUOTE_NODE_NAMES.has(name);
}

/** One quote marker at the start of a line: a standard `>` (with its optional space) or Clutter's `" `. */
const QUOTE_TOKEN = /([ \t]*)(>[ \t]?|" )/y;

export interface QuoteToken {
  readonly kind: '>' | '"';
  /** Offset in the line where the token starts, its own leading whitespace included. */
  readonly at: number;
  /** Offset of the marker character itself. */
  readonly mark: number;
  /** Offset just past the marker and its space. */
  readonly end: number;
}

/** The run of quote markers that opens a line (`" `, `" " `, `> " `, ...), and the offset where the line's own text starts. */
export function quotePrefixOf(text: string): { readonly tokens: readonly QuoteToken[]; readonly end: number } {
  const tokens: QuoteToken[] = [];
  let at = 0;
  for (;;) {
    QUOTE_TOKEN.lastIndex = at;
    const match = QUOTE_TOKEN.exec(text);
    if (!match) {
      return { tokens, end: at };
    }
    const mark = at + (match[1]?.length ?? 0);
    tokens.push({ kind: text[mark] === '"' ? '"' : '>', at, mark, end: at + match[0].length });
    at += match[0].length;
  }
}
