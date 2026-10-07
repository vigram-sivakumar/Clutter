import type { BlockContext, Line, MarkdownConfig } from '@lezer/markdown';

/**
 * A list marker — bullet (`-`/`+`/`*`) or ordered (1-9 digits,
 * CommonMark's own cap — matches `isOrderedList`'s own
 * `pos > line.pos + 9` bound in `@lezer/markdown` — then `.`/`)`) — with
 * either no separator yet (the bare marker, e.g. `1.` before Space is
 * typed), or a real space/tab separator followed by *any* content
 * (`(?:[ \t].*)?`). No leading whitespace in the pattern itself — this is
 * deliberately flush-left only; see the doc comment below for why 4+
 * columns of indentation is out of scope, not merely untested. One
 * shared alternation, not two separate predicates: both marker kinds hit
 * the identical paragraph-interrupt gap for the identical reason (see
 * below), so one pattern/one `endLeaf` covers both, matching the
 * "smallest maintainable" mandate rather than duplicating near-identical
 * logic per marker kind.
 *
 * **Includes content-bearing lines, not just the bare marker — required,
 * not optional; see "Why this must also match content" below.**
 */
const LIST_MARKER_LINE = /^(?:[-+*]|\d{1,9}[.)])(?:[ \t].*)?$/;

/**
 * Closes one narrow gap in CommonMark's own paragraph-interruption rule:
 * typing the Space that completes a bare marker (`1.` → `1. `, `-` →
 * `- `, `*` → `* `, `+` → `+ `) immediately below an ordinary paragraph
 * (no blank line) does not, by itself, make `@lezer/markdown` recognize
 * `OrderedList`/`BulletList`/`ListItem` — the built-in `isOrderedList`/
 * `isBulletList(line, cx, true)` checks (the same functions backing this
 * grammar's own list block parsers) both require non-blank content after
 * the marker before they'll let a list interrupt an open paragraph.
 * Confirmed directly against the installed `@lezer/markdown` source: a
 * blank first line is legitimate, well-formed CommonMark for a list that
 * *isn't* interrupting anything (document start, or already preceded by a
 * blank line) — it's specifically the paragraph-interrupt case that's
 * gated on non-blank content, for both marker kinds identically (marker
 * digit value/character is irrelevant to that gate).
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
 * ends and the *unmodified*, built-in `OrderedList`/`BulletList` block
 * parsers are what actually recognize and produce the resulting tree —
 * this file never re-implements or second-guesses either.
 *
 * **Why this must also match content-bearing lines (2026-08-30
 * regression fix), not just the bare marker.** Every parse — incremental
 * or fresh — is a pure function of the *current* document text plus the
 * registered predicates; there is no memory of an earlier recognition to
 * fall back on. Confirmed directly: `Paragraph\n99.` → Space → typing
 * `O` produced a tree byte-identical to a completely fresh parse of
 * `Paragraph\n99. O` on its own. With the predicate scoped to the bare
 * marker only, that final text satisfies neither this predicate (regex
 * required zero content) nor native `isOrderedList`'s own `breaking` gate
 * (which only tolerates content when the marker is single-digit `1`) —
 * so a list recognized for one instant reverted to plain paragraph text
 * on the very next keystroke, for every ordered marker except `1.`
 * (confirmed: `1.`+content already survives natively; `2.`, `9.`, `10.`,
 * `99.`, `100.`+content all regressed identically). Bullets never hit
 * this, in either scope — native `isBulletList`'s own `breaking` gate has
 * no character/digit restriction, so any bullet+content already
 * interrupts a paragraph natively, extension or not.
 *
 * **Direct, unavoidable, and consistent consequence: `Paragraph\n99. O`
 * typed or pasted fresh, with no prior bare-marker moment, also becomes
 * `OrderedList`.** Because the two documents (reached via bare-marker-
 * then-type, vs. typed/pasted whole) are byte-identical text, no
 * stateless parser — this one or any other — can ever tell them apart
 * without hidden state, which this codebase's architecture forbids. This
 * is not a new inconsistency: it brings ordered markers to parity with
 * what bullets already do, natively, today, independent of this file —
 * `Paragraph\n- I disagree`, typed fresh with zero bare-marker moment,
 * already silently becomes a `BulletList` in unmodified `@lezer/
 * markdown`. This predicate removes ordered lists' native-only
 * restriction to single-digit `1`, bringing them to the same
 * paragraph-interrupt leniency bullets already have — a broadening in
 * degree, not a new kind of surprise this document's own grammar didn't
 * already contain.
 *
 * **Resolves the `-`/Setext-heading collision as a direct, load-bearing
 * consequence of the same mechanism, not a separate fix.** A bare `-`
 * immediately below a paragraph is *also* valid CommonMark Setext-H2
 * underline syntax, and natively (confirmed empirically, no extension
 * present) `Paragraph\n-` parses as `SetextHeading2`, not lazy-
 * continuation Paragraph text, because `SetextHeadingParser` (a
 * `LeafBlockParser` registered on the open paragraph leaf) claims the
 * line before the leaf ever finishes. `BlockContext`'s own per-line loop
 * checks every registered `endLeaf` predicate *before* consulting the
 * leaf's own `LeafBlockParser`s (`for (stop of endLeafBlock) ... break
 * lines` runs ahead of `for (parser of leaf.parsers) parser.nextLine(...)`
 * in `@lezer/markdown`'s source) — so once this predicate matches a bare
 * `-`, the paragraph ends *before* `SetextHeadingParser` gets a turn at
 * all, and the unmodified `BulletList` parser recognizes it instead.
 * Confirmed directly: `Paragraph\n- ` produces `BulletList`/`ListItem`,
 * not `SetextHeading2`, once this predicate is registered.
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
 * out of scope by design, not by oversight: `Paragraph\n    1. `/
 * `Paragraph\n    - ` (or deeper) are untouched by this predicate and
 * remain ordinary paragraph text, identical to today's behavior — this
 * holds equally for the content-bearing shape (`Paragraph\n    1. O`
 * stays plain paragraph text too), since the same core-loop indent gate
 * applies before this predicate is ever consulted, regardless of what
 * the predicate itself matches.
 */
function isListMarkerLine(_cx: BlockContext, line: Line): boolean {
  return LIST_MARKER_LINE.test(line.text);
}

export const listMarkerParagraphInterrupt: MarkdownConfig = {
  parseBlock: [
    {
      name: 'ClutterListMarkerParagraphInterrupt',
      endLeaf: isListMarkerLine,
    },
  ],
};
