import type { BlockContext, LeafBlock, Line, MarkdownConfig } from '@lezer/markdown';

/**
 * Closes a gap in `@lezer/markdown`'s own GFM `Table` extension: once a
 * table's header + delimiter rows are established, its `TableParser`
 * (`nextLine`, internal to that extension, not exported) unconditionally
 * absorbs *every* following line as another `TableRow` — via `parseRow`,
 * which happily returns a one-cell row for a line with zero pipe
 * characters — and always returns `false` (never "this line doesn't
 * belong to me"), so the table's own leaf never ends on its own. Confirmed
 * directly against the installed `@lezer/markdown` source
 * (`node_modules/@lezer/markdown/dist/index.js`, `TableParser.nextLine`/
 * `parseRow`/`hasPipe`): the *only* thing that can stop that leaf mid-flow
 * is one of the parser's registered `endLeafBlock` predicates, checked
 * once per line *before* `nextLine` ever runs (`BlockContext`'s per-line
 * loop: `for (stop of endLeafBlock) if (stop(...)) break lines`). The
 * bundled `DefaultEndLeaf` set already covers ATX headings, fenced code,
 * blockquotes, and both list kinds — but nothing recognizes "ordinary
 * paragraph text with no pipe," so a bare line typed immediately below a
 * table (no blank-line separator) is silently absorbed as a ragged,
 * one-cell row instead of starting a new paragraph. Reproduced directly:
 * `| Name | Age |\n| ---- | --- |\n| John | 30 |\nHello world` parses with
 * `Hello world` inside the `Table` node, both via this app's own
 * `markdownLanguageExtension()` and via a bare `@lezer/markdown` parser
 * configured with nothing but `Table` — not a Clutter-specific
 * interaction, but this reproduction is via the exact app-level grammar
 * `markdownGrammarExtensions.ts` assembles.
 *
 * **Why `endLeaf`, not a parser fork.** Identical mechanism and rationale
 * to `list/listMarkerParagraphInterrupt.ts`'s own `endLeaf` predicate:
 * `BlockParser.endLeaf` is `@lezer/markdown`'s own public, documented
 * extension point for exactly this class of problem ("some constructs...
 * can interrupt [a leaf] even without a blank line"). This never touches
 * `@lezer/markdown` itself, never re-implements `TableParser`, and never
 * second-guesses which lines the *built-in*, unmodified `Table` extension
 * recognizes as valid header/delimiter/row syntax — it only tells the
 * shared per-line loop, for the one specific case the bundled predicate
 * set misses, "this table's leaf is done; stop offering it more lines."
 * Once this predicate matches, the *unmodified* `Table` parser is what
 * already produced the (now correctly-bounded) `Table` node, and the
 * *unmodified* default paragraph leaf is what picks the line back up as
 * fresh content — both exactly as they already do for every other
 * `endLeaf`-terminated leaf in this grammar.
 *
 * **The rule matches real GFM continuation semantics, not an arbitrary
 * narrower cutoff.** A table row is, by definition, pipe-delimited cells —
 * this is the *exact same* test (`hasPipe`) the `Table` extension itself
 * already uses to decide whether a line can even *start* a table leaf in
 * the first place (`leaf(_, leaf) { return hasPipe(leaf.content, 0) ? new
 * TableParser : null; }`); this predicate just applies that identical
 * standard symmetrically to *continuation* lines once the table is
 * already established, which the upstream extension omits. A line with no
 * pipe at all was never a valid table row to begin with, so declining to
 * treat it as a continuation is not a narrowing of GFM tables — it is
 * closing an inconsistency, and it leaves every genuine row (with or
 * without leading/trailing pipes, since pipe *position* is irrelevant to
 * `hasPipe`) fully intact, matching real GitHub rendering for the exact
 * reported reproduction case.
 *
 * **Detecting "this leaf is currently a table" without the internal,
 * unexported `TableParser` class.** `leaf.content` at the point any
 * `endLeaf` predicate runs holds every *previous* line of the open leaf,
 * joined by `\n`, and never the candidate line itself (confirmed from the
 * same core loop: `leaf.content += "\n" + line.scrub()` runs *after* the
 * `endLeafBlock` check). A table's own first two lines are always its
 * header and delimiter rows, at fixed positions, regardless of how many
 * data rows have accumulated since — so re-deriving "is this an
 * established table" only ever needs to look at `leaf.content`'s first
 * two lines, independent of how far into the table the candidate line is.
 */
const tableDelimiterRow = /^[>\s]*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/;

function hasUnescapedPipe(text: string, start: number): boolean {
  for (let i = start; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 124 /* '|' */) {
      return true;
    }
    if (code === 92 /* '\\' */) {
      i++;
    }
  }
  return false;
}

function isEstablishedTableLeaf(leafContent: string): boolean {
  const firstBreak = leafContent.indexOf('\n');
  if (firstBreak < 0) {
    return false;
  }
  const headerLine = leafContent.slice(0, firstBreak);
  const secondBreak = leafContent.indexOf('\n', firstBreak + 1);
  const delimiterCandidate = secondBreak < 0 ? leafContent.slice(firstBreak + 1) : leafContent.slice(firstBreak + 1, secondBreak);
  return hasUnescapedPipe(headerLine, 0) && tableDelimiterRow.test(delimiterCandidate);
}

function endsTableLazyAbsorption(_cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
  if (!isEstablishedTableLeaf(leaf.content)) {
    return false;
  }
  return !hasUnescapedPipe(line.text, line.basePos);
}

export const tableLazyAbsorptionGuard: MarkdownConfig = {
  parseBlock: [
    {
      name: 'ClutterTableLazyAbsorptionGuard',
      endLeaf: endsTableLazyAbsorption,
    },
  ],
};
