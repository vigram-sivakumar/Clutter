import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

import { highlightContentTag } from './highlightSyntax';

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
 * PoC scope: headings, emphasis, strikethrough, and inline code. Quote/list
 * styling is later, additive entries in this same style definition — not a
 * reason to add a second HighlightStyle.
 *
 * Emphasis: `@lezer/markdown`'s `markdownHighlighting` tags `Emphasis`
 * with `tags.emphasis` and `StrongEmphasis` with `tags.strong` (confirmed
 * against the installed `@lezer/markdown` source, same as the heading
 * tags above). `***bold italic***`/`___bold italic___` parse as one
 * construct nested inside the other (confirmed empirically: `Emphasis >
 * [EmphasisMark, StrongEmphasis, EmphasisMark]`) — CM6's tree highlighter
 * already accumulates classes from enclosing tagged ancestors onto nested
 * spans (the same mechanism that lets `tok-heading1` and `tok-mark` both
 * land on `HeaderMark`), so the inner span gets both `tok-emphasis` and
 * `tok-strong` with no extra entry needed here.
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
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, class: 'tok-heading1' },
  { tag: tags.heading2, class: 'tok-heading2' },
  { tag: tags.heading3, class: 'tok-heading3' },
  { tag: tags.heading4, class: 'tok-heading4' },
  { tag: tags.heading5, class: 'tok-heading5' },
  { tag: tags.heading6, class: 'tok-heading6' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.strikethrough, class: 'tok-strike' },
  { tag: highlightContentTag, class: 'tok-highlight' },
  { tag: tags.monospace, class: 'tok-code' },
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
