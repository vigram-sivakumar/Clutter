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
