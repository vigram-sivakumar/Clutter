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
 * The visual code-block *card's* per-line background — via `Decoration.line`
 * classes on `.cm-line`, the same native mechanism `blockquoteLineDecoration.ts`/
 * `tableDecoration.ts`/`horizontalRuleDecoration.ts` already use for their own
 * line-level presentation (confirmed as a legitimate, precedented Clutter
 * pattern by this feature's own architecture investigation — decorating
 * `.cm-line` was never the problem; `margin` specifically was).
 *
 * **Deliberately reinstated 2026-09-10, narrower than its own first
 * version: this file owns per-line presentation only, never structural
 * grouping, and (as of the border/radius move onto `.cm-code-block`) never
 * the card's border/radius either.** `highlight/fencedCodeBlockWrapper.ts`'s
 * `EditorView.blockWrappers` already gives every `FencedCode` node its own
 * real `<div class="cm-code-block">` parent, so two independent, back-to-back
 * blocks (no blank line between them) are already two separate DOM subtrees
 * *before* this file runs — the `--first`/`--last` computation below only
 * needs to place the correct padding/gutter treatment on the correct line
 * *within* an already-correctly-grouped block, not additionally prevent two
 * different blocks' lines from reading as one merged run (an earlier version
 * of this file, predating the wrapper, had to solve that problem itself; it
 * no longer needs to).
 *
 * Every owned line still gets the shared `cm-code-block-line` class
 * (background, horizontal `padding-inline` — safe per `.cm-hr-line`'s own
 * existing vertical-padding precedent, and confirmed directly this session:
 * `padding` does not reproduce the `margin` cursor/navigation corruption on
 * either `.cm-line` or `.cm-code-block`).
 * The line containing the owning node's own `.from` additionally gets
 * `cm-code-block-line--first`; the line containing the node's own `.to`
 * gets `cm-code-block-line--last`. A single-line-body block's one line
 * carries both modifiers at once. Border/radius are no longer painted via
 * these modifiers at all — `.cm-code-block` (the block-level wrapper,
 * `fencedCodeBlockWrapper.ts`) owns the complete visual border treatment
 * unconditionally now, so `--first`/`--last` here only ever drive the
 * remaining per-line concerns below (padding, gutter-number exclusion).
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
 * adjacent cards is `fencedCodeBlockWrapper.ts`'s `.cm-code-block`'s own
 * `padding-block`, never a property here.
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
function fencedCodeLineMark(isFirst: boolean, isLast: boolean, isActive: boolean): Decoration {
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
  return Decoration.line({ attributes: { class: classes.join(' ') } });
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
          builder.add(line.from, line.from, fencedCodeLineMark(isFirst, isLast, isActive));
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
