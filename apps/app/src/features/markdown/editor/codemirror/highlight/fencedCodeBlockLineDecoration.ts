import { foldState, syntaxTree } from '@codemirror/language';
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
 * The visual code-block *card* — background, inset border, outer
 * drop-shadow, radius, and gutter/counter scope, entirely via
 * `Decoration.line` classes on `.cm-line`, the same native mechanism
 * `blockquoteLineDecoration.ts`/`tableDecoration.ts`/`horizontalRuleDecoration.ts`
 * already use for their own line-level presentation (confirmed as a
 * legitimate, precedented Clutter pattern by this feature's own
 * architecture investigation — decorating `.cm-line` was never the
 * problem; `margin` specifically was).
 *
 * **Owns the complete visual card again as of the 2026-09-16 wrapper-removal
 * migration — structural grouping is `fencedCodeBlockWrapper.ts`'s only
 * remaining job, and even that is being phased out (see
 * `docs/editor-architecture-decisions.md`).** Two independent, back-to-back
 * blocks (no blank line between them) are two separate DOM subtrees without
 * any wrapper's help: `--first`/`--last` are derived from each block's own
 * `FencedCode` node `.from`/`.to` directly (never DOM adjacency), so nothing
 * about this file's own correctness depends on whether a wrapper exists.
 *
 * Every owned line gets the shared `cm-code-block-line` class (background,
 * left/right border, outer shadow, horizontal `padding-inline`); the line
 * containing the owning node's own `.from` additionally gets
 * `cm-code-block-line--first` (top border/radius, `counter-reset`); the
 * line containing the node's own `.to` gets `cm-code-block-line--last`
 * (bottom border/radius). A single-line-body block's one line carries both
 * modifiers at once. See `MarkdownEditor.css`'s own doc comment on
 * `.cm-code-block-line` for exactly how the per-line border/shadow
 * composition reproduces one continuous card with no shared ancestor.
 *
 * **`cm-code-block-line--active` (2026-09-11, code-content-only 2026-09-12):**
 * the one *code-content* line containing `state.selection.main.head` —
 * never the opening (` ```lang`) or closing (` ``` `) fence line, even
 * while the caret sits on one of them, since those are structural
 * Markdown syntax, not code — and only when that position's own nearest
 * `FencedCode` ancestor is the *same node* that owns the line being
 * decorated — deliberately head-only, not every line touched by a
 * multi-line selection (a current-line indicator, not a second selection
 * highlight; the selection layer already renders the selected range
 * itself). Reuses this file's own `nearestFencedCode` for the caret's
 * position, the same "which FencedCode node owns this position" query
 * already used for line membership, so a caret in one block never marks a
 * line active in some other block. Recomputed on `selectionSet` in
 * addition to `docChanged`/`viewportChanged` below — the same trigger
 * `fencedCodeLanguageLabelDecoration.ts` already uses for its own
 * per-caret-position recompute.
 *
 * **No `margin` anywhere in this file** — the external gap between
 * adjacent cards is `blockSeparatorDecoration.ts`'s own generic
 * block-widget spacing mechanism (12/6/0px, the same authority every other
 * construct pair in this document goes through), never a property here.
 *
 * Line-ownership algorithm (which lines belong to a `FencedCode` at all) is
 * a direct reuse of `blockquoteLineDecoration.ts`'s own approach: iterate
 * every visible physical line, probe its first non-whitespace character
 * (or the line's own start, for a genuinely blank line), and ask the
 * syntax tree which `FencedCode` ancestor (if any) owns that position —
 * never walking the node's own range directly for *membership*. This
 * correctly includes the block's own blank interior lines while correctly
 * excluding lines genuinely outside it; only the first/last *modifier*
 * classes are derived from the owning node's own boundary positions.
 */
function fencedCodeLineMark(
  isFirst: boolean,
  isLast: boolean,
  isActive: boolean,
  gutterDigits: number
): Decoration {
  const classes = ['cm-code-block-line'];
  if (isFirst) {
    classes.push('cm-code-block-line--first');
  }
  if (isLast) {
    classes.push('cm-code-block-line--last');
  }
  if (isActive) {
    classes.push('cm-code-block-line--active');
  }
  return Decoration.line({
    attributes: { class: classes.join(' '), style: `--code-gutter-digits: ${gutterDigits};` },
  });
}

/**
 * Per-line replacement for `fencedCodeBlockWrapper.ts`'s own per-instance
 * `--code-gutter-digits` (a `BlockWrapper` attribute, set once per block on
 * a shared DOM ancestor). Wrapper-free architecture has no such ancestor
 * for the property to live on or inherit down from, but CSS custom
 * properties need no ancestor to begin with — setting the identical value
 * as an inline `style` on every owned line (not just the first) achieves
 * the same per-block-scoped gutter width with no cross-line coordination:
 * each line independently derives it from its own `owner` node (already
 * resolved below for `--first`/`--last`), not from a value computed once
 * and shared. Computed from `owner.from`/`owner.to`'s own line numbers —
 * no new syntax-tree walk, since `owner` is already the per-line
 * `nearestFencedCode` result this function's caller resolves anyway.
 */
function gutterDigitsFor(view: EditorView, owner: SyntaxNode): number {
  const firstLine = view.state.doc.lineAt(owner.from).number;
  const lastLine = view.state.doc.lineAt(owner.to).number;
  const contentLineCount = Math.max(1, lastLine - firstLine + 1 - 2);
  return String(contentLineCount).length;
}

function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

/**
 * The nearest enclosing `FencedCode` ancestor of `probePos`, or `null` if
 * `probePos` isn't inside one at all — a pure syntax-tree query (only
 * `EditorState` + a position; no `view`, no decorations, no rendering
 * assumptions). Exported so `highlight/blockSeparatorDecoration.ts` can
 * reuse this exact lookup to decide how *its own* separator decoration
 * should be represented when immediately adjacent to a fenced code block
 * — a read *of* this module's existing knowledge, not a change *to* this
 * module's own ownership of fenced-code line/wrapper behavior.
 */
export function nearestFencedCode(state: EditorState, probePos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'FencedCode') {
      return node;
    }
  }
  return null;
}

function buildFencedCodeLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();

  const caretPos = view.state.selection.main.head;
  const caretLine = view.state.doc.lineAt(caretPos);
  const caretOwner = nearestFencedCode(view.state, caretPos);

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);

        const probePos = line.from + firstNonWhitespaceOffset(line.text);
        const owner = nearestFencedCode(view.state, probePos);
        if (owner) {
          const isFirst = line.from <= owner.from && owner.from <= line.to;
          // `owner.to` is an exclusive boundary: when the block's closing
          // fence (or, unclosed, its last content) is immediately followed
          // by the document's own trailing newline, that boundary coincides
          // with the `.from`/`.to` of the synthetic empty line CM6 always
          // adds after a final `\n` — a line the syntax tree itself assigns
          // no `FencedCode` owner. Probing `owner.to` directly against
          // `line.to` would then match that ownerless phantom line instead
          // of the block's real last line, leaving no line marked `--last`
          // at all. Probing one position further back — the block's own
          // last real character — always lands back inside the real last
          // line, regardless of whether the doc has a trailing newline.
          const lastRealPos = owner.to > owner.from ? owner.to - 1 : owner.to;
          const isLast = line.from <= lastRealPos && lastRealPos <= line.to;
          // Compared by range, not object identity: separate
          // `resolveInner` calls (even against the same immutable syntax
          // tree) aren't guaranteed to hand back the same `SyntaxNode`
          // object for the same underlying node, only an equivalent one —
          // a `FencedCode` node's own `[from, to)` is a reliable, cheap
          // proxy for "is this the same block" instead.
          //
          // `!isFirst && !isLast` (2026-09-12): the opening (` ```lang`)
          // and closing (` ``` `) fence lines are structural Markdown
          // syntax, not code content — they never get the active-line
          // background, even while the caret sits on one of them. A
          // single-line/empty block (`isFirst && isLast` both true on its
          // one line) has no code-content line at all, so it's correctly
          // never active either.
          const isActive =
            !isFirst &&
            !isLast &&
            line.from === caretLine.from &&
            caretOwner !== null &&
            owner.from === caretOwner.from &&
            owner.to === caretOwner.to;
          builder.add(
            line.from,
            line.from,
            fencedCodeLineMark(isFirst, isLast, isActive, gutterDigitsFor(view, owner))
          );
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

interface FencedCodeBlockLinePlugin extends PluginValue {
  decorations: DecorationSet;
}

export function fencedCodeBlockLineDecoration(): Extension {
  return ViewPlugin.fromClass<FencedCodeBlockLinePlugin>(
    class implements FencedCodeBlockLinePlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildFencedCodeLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          // Folding/unfolding a fenced code block (codemirror/fold/
          // foldToggleDecoration.ts) doesn't necessarily set
          // `viewportChanged` on its own — this is the same explicit
          // `foldState` comparison that extension's own `update()` uses,
          // so this decoration set (isFirst/isLast/isActive, gutter
          // numbering) stays correct the moment a fold toggles, not just
          // on the next unrelated doc/viewport/selection change.
          update.startState.field(foldState, false) !== update.state.field(foldState, false)
        ) {
          this.decorations = buildFencedCodeLineDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
