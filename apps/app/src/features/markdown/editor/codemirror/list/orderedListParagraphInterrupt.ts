import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';

/**
 * A bare ordered-list marker and nothing else: leading digits (1-9 of
 * them, CommonMark's own cap — matches `isOrderedList`'s own
 * `pos > line.pos + 9` bound in `@lezer/markdown`), then `.`/`)`,
 * optionally followed by exactly the one separator character a user's
 * next keystroke (Space) produces. No leading whitespace in the pattern
 * itself — this is deliberately flush-left only; see the doc comment
 * below for why 4+ columns of indentation is out of scope, not merely
 * untested.
 */
const BARE_ORDERED_MARKER = /^\d{1,9}[.)][ \t]?$/;

/**
 * Closes one narrow gap in CommonMark's own paragraph-interruption rule:
 * typing the Space that completes `1.` into `1. ` immediately below an
 * ordinary paragraph (no blank line) does not, by itself, make `@lezer/
 * markdown` recognize `OrderedList`/`ListItem` — the built-in
 * `isOrderedList(line, cx, true)` check (the same function backing this
 * grammar's own `OrderedList` block parser) requires non-blank content
 * after the marker before it will let a list interrupt an open paragraph.
 * Confirmed directly against the installed `@lezer/markdown` source: a
 * blank first line is legitimate, well-formed CommonMark for a list that
 * *isn't* interrupting anything (document start, or already preceded by a
 * blank line) — it's specifically the paragraph-interrupt case that's
 * gated on non-blank content, and marker digit value is irrelevant to
 * that gate.
 *
 * `BlockParser.endLeaf` is `@lezer/markdown`'s own public, documented
 * mechanism for exactly this class of problem — its own JSDoc: "Some
 * constructs... can interrupt paragraphs even without a blank line. If
 * your construct can do this, provide a predicate here that recognizes
 * lines that should end a paragraph." Registered through the same
 * `MarkdownConfig`/`parseBlock` mechanism every other Clutter grammar
 * extension in this directory already uses (`wikiLinkSyntax`,
 * `tagSyntax`, `dateSyntax`, `highlightSyntax`) — not a second parser,
 * not a grammar fork; once this predicate returns `true`, the paragraph
 * ends and the *unmodified*, built-in `OrderedList` block parser is what
 * actually recognizes and produces the resulting tree.
 *
 * **Deliberately flush-left only.** `@lezer/markdown`'s per-line
 * leaf-accumulation loop only consults *any* `endLeaf` predicate
 * (built-in or custom) when `line.indent < line.baseIndent + 4` — a
 * single, shared, non-configurable guard with no public API surface to
 * relax, confirmed by reading `BlockContext.advance()`'s own source and
 * the complete `MarkdownConfig`/`BlockParser` interface (`props`,
 * `defineNodes`, `parseBlock`, `parseInline`, `remove`, `wrap` — none
 * touch this). For a plain top-level paragraph (no enclosing list/
 * blockquote), `baseIndent` is always `0`, so this reduces to: a marker
 * indented 4+ columns is silently never offered to this predicate at
 * all. This is CommonMark's own universal "4 columns past the container
 * = code/lazy-continuation territory" rule — the same boundary that
 * governs indented code blocks and list-item content columns throughout
 * the spec, independent of this grammar's own separate, unrelated
 * removal of the `IndentedCode` *block parser* elsewhere in
 * `markdownGrammarExtensions.ts`. Reaching that depth would require
 * patching/forking `@lezer/markdown`'s own block-parsing loop — exactly
 * the "second parser" this codebase's architecture forbids — so it is
 * out of scope by design, not by oversight: `Paragraph\n    1. ` (or
 * deeper) is untouched by this predicate and remains ordinary paragraph
 * text, identical to today's behavior.
 *
 * **Deliberately ordered-markers-only, and deliberately blank-marker-only
 * (no bullets, no marker-plus-content widening).** Bullets have a
 * separate, unrelated collision with Setext-heading underline syntax
 * (`-` alone is also valid `SetextHeading2` underline text) that this
 * predicate does not address — scoped out to keep this change to exactly
 * the requested case. A marker followed by real content (`2. A`) is left
 * to native CommonMark behavior unchanged — once a marker's own blank
 * instant is recognized here, every subsequent keystroke is ordinary
 * incremental reparsing of an already-real `ListItem`, so no wider
 * interrupt-recognition is needed for typing to continue correctly.
 */
function isBareOrderedMarkerLine(_cx: BlockContext, line: Line): boolean {
  return BARE_ORDERED_MARKER.test(line.text);
}

export const orderedListParagraphInterrupt: MarkdownConfig = {
  parseBlock: [
    {
      name: 'ClutterOrderedListParagraphInterrupt',
      endLeaf: isBareOrderedMarkerLine,
    },
  ],
};
