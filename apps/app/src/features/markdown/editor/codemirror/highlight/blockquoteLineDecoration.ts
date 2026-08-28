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
 * The bar itself stays depth-*un*aware (2026-08-26 milestone reset — a
 * prior version rendered N bars/`cm-quote-line-N` for an N-deep `>>>`
 * quote via per-level `Decoration.widget`s; reverted, still visible in git
 * history). Exactly one `cm-quote-line` class and exactly one bar per
 * physical line, at any nesting depth — `>>>>>>>> text` and `> text` get
 * the same bar. Nested-depth *bar* representation is still out of scope.
 *
 * `--quote-depth` (2026-08-28, hanging-indent reinstatement) is a
 * different concern from the bar, added alongside it on the same line
 * class: the owning `Blockquote`'s own nesting depth (1 for a plain
 * `> quote`, 2 for `> > quote`, …), read by `.cm-quote-line`'s CSS to
 * reserve `--quote-depth * var(--marker-width)` of hanging indent — see
 * that CSS rule's own doc comment for why this is safe to compute as a
 * pure depth multiplier (unlike list markers, a blockquote marker's
 * rendered box is a fixed, CSS-forced `var(--marker-width)` regardless of
 * nesting level, confirmed in `blockquoteMarkerDecoration.ts`'s own
 * `.cm-quote-marker` rule — `display: inline-block; width:
 * var(--marker-width)` — so no real-DOM measurement is needed, only a
 * depth count from the syntax tree).
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
 * Leading whitespace never affects this: the probe is the line's first
 * *non-whitespace* character, so `  >>> indented` still resolves inside
 * the `Blockquote` the same way un-indented `>>> text` does.
 *
 * No gutter of any kind is reserved by this file (no `padding-inline-start`,
 * no in-flow gutter widget — a prior version of this file added one,
 * `QuoteIndentWidget`; reverted 2026-08-27, still visible in git history).
 * Per the current DOM-structure direction, gutter geometry is owned
 * entirely by `blockquoteMarkerDecoration.ts`'s own marker span
 * (`.cm-quote-marker`) — the marker's own box reserves the space a
 * line-level gutter used to. This file is scoped purely to the bar and
 * line ownership, nothing else.
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
    attributes: { class: 'cm-quote-line', style: `--quote-depth: ${depth}` },
  });
}

function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

function nearestBlockquote(state: EditorState, probePos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'Blockquote') {
      return node;
    }
  }
  return null;
}

/**
 * Nesting depth of a physical line's own blockquote marker chain,
 * 1-indexed (a plain, non-nested `> quote` is depth 1, not 0) — the count
 * of `.cm-quote-marker` boxes `blockquoteMarkerDecoration.ts` actually
 * renders on *this line*, which the CSS multiplier this feeds
 * (`--quote-depth * var(--marker-width)`) must reserve space for.
 *
 * Deliberately walks **down** from `outerNode` (the shallowest enclosing
 * `Blockquote`, already found by `nearestBlockquote`'s upward walk from a
 * line-start probe), through successive `Blockquote` children whose own
 * range begins on the same physical line — not a plain upward
 * parent-count from wherever the probe happened to resolve. Necessary,
 * not just a style choice: confirmed by direct repro against a real
 * parsed tree that a shallow probe (line's first non-whitespace
 * character) for `">> nested"` resolves to the *outer* `QuoteMark` leaf
 * (position 0 is only inside the outer `Blockquote`'s own range — the
 * inner one starts at position 1, past it), so walking upward from there
 * finds only the outer `Blockquote` and undercounts nested depth by one
 * level per level of nesting. Walking down from that same outer node
 * instead — following whichever `Blockquote` child, if any, also starts
 * on this line — reaches the true innermost level `>> nested` (or `>>>`,
 * etc.) is actually renders as, regardless of how many marker characters
 * are on the line.
 *
 * `lineFrom`/`lineTo` scope the walk to *this* physical line only — a
 * `Blockquote` child that starts on a *later* line (e.g. the second line
 * of `> outer\n> > nested`, where the nested quote only begins on line 2)
 * must not be counted for line 1's own depth.
 */
function quoteDepth(outerNode: SyntaxNode, lineFrom: number, lineTo: number): number {
  let depth = 0;
  let node: SyntaxNode | null = outerNode;

  while (node && node.name === 'Blockquote') {
    depth++;

    let next: SyntaxNode | null = null;
    for (let child: SyntaxNode | null = node.firstChild; child; child = child.nextSibling) {
      if (child.name === 'Blockquote' && child.from >= lineFrom && child.from < lineTo) {
        next = child;
        break;
      }
    }
    node = next;
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

        const probePos = line.from + firstNonWhitespaceOffset(line.text);
        const blockquote = nearestBlockquote(view.state, probePos);
        if (blockquote) {
          builder.add(line.from, line.from, quoteLineMark(quoteDepth(blockquote, line.from, line.to)));
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
