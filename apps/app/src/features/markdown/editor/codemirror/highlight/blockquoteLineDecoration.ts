import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Visual left-border rule marking every physical line that belongs to a
 * blockquote — the "line in front" real Markdown editors (Obsidian,
 * Notion) draw alongside quoted content. Purely presentational: it adds a
 * `Decoration.line` class, never touches the document, never depends on
 * selection/engagement, and coexists with `blockquoteMarkerDecoration.ts`
 * (which separately conceals the raw `> ` marker text at rest) rather than
 * replacing it — the two are independent decoration sources over disjoint
 * concerns (marker text vs. line presentation), the same relationship
 * `listMarkerDecoration.ts`/`listLineDecoration.ts` already have.
 *
 * Line-ownership algorithm is a direct reuse of `listLineDecoration.ts`'s
 * own approach (iterate every visible physical line, ask the syntax tree
 * which construct — there, nearest `ListItem`; here, nearest `Blockquote`
 * — owns it), not a `Blockquote` node's own `[from, to)` range walked
 * directly. That reuse is deliberate, not just convenient: probing per
 * line, at the line's own content position, is what already correctly
 * handles lazy continuation (a later line with no `>` of its own, whose
 * text is nested inside the `Paragraph` `blockquoteMarkerDecoration.ts`
 * already confirmed is still a `Blockquote` descendant) and nested `>>`
 * quotes (a genuinely separate, nested `Blockquote` node) without any
 * special-casing — walking up from a resolved leaf to the nearest
 * `Blockquote` ancestor finds the right owner either way, and a line
 * inside a nested quote still has a `Blockquote` ancestor (the outer one,
 * at minimum), so it gets the same line class as any other quoted line.
 * Depth-aware: nested `>>`/`>>>` quotes are genuinely nested `Blockquote`
 * nodes in the Lezer tree (confirmed directly — `>> text` parses as
 * `Blockquote > QuoteMark, Blockquote > QuoteMark, Paragraph`, not one
 * `Blockquote` with a depth attribute), so the number of `Blockquote`
 * ancestors at a line's probe position *is* the line's quote depth,
 * straight from the syntax tree — never inferred from indentation or
 * character counting. `blockquoteDepth` counts them instead of stopping at
 * the first, and the line decoration exposes the count as both a
 * `cm-quote-line-N` class and a `--quote-depth` CSS custom property so the
 * stylesheet can render N visual bars without a second decoration source.
 * Ownership (`isBlockquoteOwned`, forward probe at the first non-whitespace
 * character) and depth (`blockquoteDepth`, backward probe at `line.to`) are
 * deliberately two separate probes rather than one shared position: the
 * forward probe is what makes the blank-line handling below correct, while
 * the backward probe is what reaches inside `>>`'s inner `Blockquote`
 * (probing at a `QuoteMark`'s own start position under-resolves nested
 * depth — see `blockquoteDepth`'s own comment).
 *
 * Unlike `listLineDecoration.ts`, genuinely blank/whitespace-only physical
 * lines are **not** skipped: a blockquote can legitimately contain an
 * empty paragraph-separator line that still carries its own `>` (e.g. the
 * middle line of `> one\n>\n> two`) and the rule must stay continuous
 * across it. Probing at the line's first non-whitespace character (or
 * `line.from` itself when the line is empty) and asking the tree for the
 * nearest `Blockquote` ancestor handles this uniformly: a quote-internal
 * blank line still resolves inside the `Blockquote`'s own range and gets
 * the class; a genuine document-blank line that ends the quote (no `>`,
 * per CommonMark) resolves outside it and correctly gets nothing — the
 * parser has already made that call, so this decoration only ever reads
 * it, never re-derives CommonMark's own blank-line-termination rule.
 */
function quoteLineMark(depth: number): Decoration {
  return Decoration.line({
    attributes: {
      class: `cm-quote-line cm-quote-line-${depth}`,
      style: `--quote-depth: ${depth}`,
    },
  });
}

function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

/**
 * Ownership uses the same forward probe as before (the first
 * non-whitespace position, biased forward): this is what already
 * correctly distinguishes a quote-internal blank separator line from a
 * genuine CommonMark-terminating blank line — unchanged, since depth
 * awareness must not regress that existing behavior.
 */
function isBlockquoteOwned(state: EditorState, line: { from: number; text: string }): boolean {
  const probePos = line.from + firstNonWhitespaceOffset(line.text);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'Blockquote') {
      return true;
    }
  }
  return false;
}

/**
 * Depth is probed at the *end* of the line, not its first non-whitespace
 * character. A line's own `QuoteMark`(s) sit at the very start of the
 * line, and `>>`'s outer `QuoteMark` ends exactly where the inner
 * `Blockquote` begins — probing right at that boundary only ever resolves
 * inside the outer node, undercounting nested depth by however many
 * markers are being stood on (confirmed empirically: probing `">> two"`
 * at offset 0 resolves depth 1, not 2). Probing at `line.to` instead lands
 * inside the innermost `Paragraph` the line's actual content belongs to,
 * whose full `Blockquote` ancestor chain is exactly the line's depth —
 * verified against `>> two` (depth 2), a bare `>` separator line (depth
 * 1), a lazy-continuation line with no marker of its own (depth inherited
 * from its `Blockquote`), and indented `  >> quote` (depth 2, unaffected
 * by the leading spaces). Only called once `isBlockquoteOwned` has
 * already confirmed the line belongs to a quote — a genuinely empty line
 * (`line.to === line.from`) never reaches here, since an empty line can
 * never itself carry a `>` and always fails that ownership check first.
 */
function blockquoteDepth(state: EditorState, lineTo: number): number {
  let depth = 0;
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(lineTo, -1);
  for (; node; node = node.parent) {
    if (node.name === 'Blockquote') {
      depth++;
    }
  }
  return depth;
}

function buildBlockquoteLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);

        if (isBlockquoteOwned(view.state, line)) {
          const depth = blockquoteDepth(view.state, line.to);
          builder.add(line.from, line.from, quoteLineMark(depth));
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

interface BlockquoteLineDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function blockquoteLineDecoration(): Extension {
  return ViewPlugin.fromClass<BlockquoteLineDecorationPlugin>(
    class implements BlockquoteLineDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildBlockquoteLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildBlockquoteLineDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
