import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

/**
 * Purely visual Markdown styling, distinct from the reveal-on-engagement
 * semantic-token mechanism (`../semanticToken/`) — this file only ever
 * adds a CSS class to already-parsed text, never replaces or hides it.
 * `@lezer/markdown`'s own parser already tags every ATXHeading1-6/
 * SetextHeading1-2 node with `tags.heading1`-`tags.heading6` (confirmed
 * directly against the installed `@lezer/markdown` source, not assumed —
 * `markdownHighlighting` in its `dist/index.js`), so this file only
 * supplies the CSS class each tag maps to; it adds no parsing, no node
 * types, no decorations beyond CM6's own built-in tree-highlighting
 * ViewPlugin (`syntaxHighlighting`'s internal `TreeHighlighter`).
 *
 * PoC scope: headings only. Emphasis/code/quote/list styling are later,
 * additive entries in this same style definition — not a reason to add a
 * second HighlightStyle.
 *
 * `tags.processingInstruction` (the `HeaderMark`/`QuoteMark`/`ListMark`/
 * `LinkMark`/`EmphasisMark`/`CodeMark` group, per `@lezer/markdown`'s own
 * `markdownHighlighting` styleTags spec) is included specifically so
 * `HeaderMark` gets a class distinguishable from its surrounding heading
 * text — verified directly, not assumed: without this entry, `# H1`
 * rendered as one single `<span class="tok-heading1">` covering the `#`
 * and the text together, since `TreeHighlighter` only splits spans at
 * class-boundary changes and `HeaderMark` contributed no class of its
 * own. `tok-mark` is deliberately generic (not `tok-headermark`) since
 * the same class will apply to every punctuation-mark kind once Live
 * Preview hiding extends beyond headings — one selector, not one per
 * construct.
 */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, class: 'tok-heading1' },
  { tag: tags.heading2, class: 'tok-heading2' },
  { tag: tags.heading3, class: 'tok-heading3' },
  { tag: tags.heading4, class: 'tok-heading4' },
  { tag: tags.heading5, class: 'tok-heading5' },
  { tag: tags.heading6, class: 'tok-heading6' },
  { tag: tags.processingInstruction, class: 'tok-mark' },
]);

/**
 * `fallback: true` — this is the only highlight style registered for the
 * editor today, so it must apply even though nothing has claimed higher
 * `syntaxHighlighting` precedence. Irrelevant once a second, more
 * specific style is ever added, but correct and necessary now.
 */
export function markdownHighlighting(): Extension {
  return syntaxHighlighting(markdownHighlightStyle, { fallback: true });
}
