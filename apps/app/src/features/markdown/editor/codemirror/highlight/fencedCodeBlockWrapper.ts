import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { BlockWrapper, EditorView } from '@codemirror/view';

/**
 * Per-block *structural* grouping for fenced code — built on
 * `EditorView.blockWrappers`, CM6's native mechanism (confirmed against the
 * installed `@codemirror/view@6.43.9` source and its own changelog,
 * introduced 6.39.0, nesting-rank support added 6.43.0) for wrapping a
 * range of real, editable lines in a genuine DOM parent that CM6 itself
 * creates and manages.
 *
 * **Deliberately narrow scope, corrected 2026-09-10 (second correction the
 * same day): `.cm-code-block` owns grouping and spacing only — never the
 * visual card (background/border/radius).** An earlier version of this
 * file put the *entire* visual presentation here, on the theory that
 * `.cm-line` should carry no fenced-code styling of any kind. Real
 * interactive testing overturned the *margin* half of that theory but not
 * the rest: `margin` was confirmed to break CM6 cursor/navigation
 * **even when applied to this wrapper**, not only when applied directly to
 * `.cm-line` — so `margin` is banned from the fenced-code layout path
 * entirely, on any element, not just `.cm-line`. `padding`, tested
 * directly, does not have this problem on either element. The visual card
 * itself (background/border/first-last radius) is therefore back on
 * `.cm-line`, via `highlight/fencedCodeBlockLineDecoration.ts`'s
 * `Decoration.line` classes (`cm-code-block-line`/`--first`/`--last`) — the
 * same native mechanism blockquote/table/horizontal-rule already use for
 * their own line-level presentation, confirmed by the architecture
 * investigation two passes ago to be a legitimate, precedented pattern in
 * this codebase. This file's only remaining job is what `blockWrappers`
 * uniquely provides and `Decoration.line` cannot: real, CM6-native
 * structural grouping — for a `FencedCode` node's own `[from, to)` range,
 * every `.cm-line` (and block widget) inside it becomes the actual DOM
 * child of one `<div class="cm-code-block">`, so two independent,
 * back-to-back `FencedCode` blocks (no blank line between them — legal
 * CommonMark) are two separate wrapper elements *by construction*, with no
 * adjacency logic anywhere — the entire class of bug the line-decoration's
 * own `--first`/`--last` computation would otherwise need to guard against
 * on its own (and did, in an earlier pass, before this wrapper existed).
 * `.cm-code-block` may carry `padding-block` for the external gap between
 * adjacent cards (real, uncollapsed space — unlike margin, `padding` never
 * collapses between siblings, so a `--space-12` value on each side of two
 * adjacent wrappers sums to a real, visible gap, not a collapsed single
 * value) — but never `margin`, and never background/border/radius, which
 * belong entirely to the line decoration now.
 *
 * **No `ViewPlugin` needed.** `EditorView.blockWrappers`'s facet input type
 * accepts either a `RangeSet<BlockWrapper>` or a `(view: EditorView) =>
 * RangeSet<BlockWrapper>` function (confirmed directly against the
 * installed source: `DocView.updateDeco()` calls `state.facet(blockWrappers)
 * .map(v => typeof v == "function" ? v(this.view) : v)`, and this runs from
 * both `DocView`'s constructor *and* its `update()` method — i.e. on every
 * relevant view update, not just once). Providing the function form
 * directly via `EditorView.blockWrappers.of(...)` is therefore sufficient
 * on its own; CM6 re-invokes it exactly when it needs the current wrapper
 * set, the same recomputation guarantee a `ViewPlugin`'s own `update()`
 * would otherwise have to reimplement by hand.
 *
 * **`--code-gutter-digits` (2026-09-11): each block's own line-number
 * gutter width, as a CSS custom property set directly on this wrapper.**
 * Line numbers themselves are rendered by plain CSS (`counter-reset` here,
 * `counter-increment`/`::before` per line in `MarkdownEditor.css`) rather
 * than a per-line JS widget — see this feature's own architecture
 * investigation: a widget decoration would mean constructing one DOM node
 * per visible code line purely to hold text a CSS counter already produces
 * natively, for no benefit (numbering, per-block reset, and blank-line
 * inclusion all fall out of `counter()` scoping for free). The one thing
 * CSS counters can't derive on their own is *how wide* the gutter column
 * needs to be so a 1-digit and a 3-digit block both right-align cleanly —
 * that's a real per-block fact (this node's own line count), computed once
 * here (where the node is already being visited) and threaded down via a
 * custom property, since `BlockWrapper.attributes` is a plain per-instance
 * object (confirmed against the installed source: `BlockWrapperTile.domAttrs`
 * returns `wrapper.attributes` directly, applied via `dom.setAttribute`,
 * and `BlockWrapper.eq` already compares attributes for equality — so a
 * differing digit count between two renders is correctly detected as a
 * real DOM update, not silently reused from the old wrapper). Building one
 * `BlockWrapper` per node (rather than reusing a single shared constant,
 * as before) is what makes this possible.
 */
function fencedCodeBlockWrapperFor(view: EditorView, node: { from: number; to: number }): BlockWrapper {
  const firstLine = view.state.doc.lineAt(node.from).number;
  const lastLine = view.state.doc.lineAt(node.to).number;
  // The fence-marker lines themselves (the node's own opening/closing ```
  // lines) are never numbered — see MarkdownEditor.css's own
  // `:not(--first):not(--last)` scoping for why — so the largest number
  // that will actually be displayed is the *content* line count, not the
  // block's total physical line count. Clamped to at least 1 so a
  // fence-only/empty block (or the degenerate single-physical-line case,
  // where the opening and closing fence collapse onto one line) never
  // computes a zero- or negative-width gutter.
  const contentLineCount = Math.max(1, lastLine - firstLine + 1 - 2);
  const digits = String(contentLineCount).length;

  return BlockWrapper.create({
    tagName: 'div',
    attributes: { class: 'cm-code-block', style: `--code-gutter-digits: ${digits};` },
  });
}

function buildFencedCodeBlockWrappers(view: EditorView): Range<BlockWrapper>[] {
  const ranges: Range<BlockWrapper>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') {
          return;
        }
        // `node.to - 1`, not `node.to`: `BlockWrapper`'s own type
        // declaration documents its range as `[from, to)` — explicitly
        // *not* including `to` — but the installed `@codemirror/view`
        // source's actual coverage check (`TileBuilder.updateBlockWrappers`,
        // `cur.to >= this.pos`) treats `to` *inclusively*, contradicting
        // that documented contract. Since a `FencedCode` node's own `.to`
        // always lands exactly at the end of its closing fence line (the
        // same position `Line.to` reports for that line, which never
        // includes the line's own trailing newline), using `node.to`
        // directly as the wrapper's `to` makes the wrapper's *actual*
        // coverage extend one position *past* its own content, onto the
        // connecting newline character shared with whatever follows —
        // never this block's own content, just an artifact of the
        // implementation's inclusive check. `node.to - 1` gives the
        // wrapper the range its own documentation already promises.
        // Verified directly this never excludes real content: for every
        // `FencedCode` shape tested (normal, empty, unclosed, tilde-
        // fenced, at document end with and without a trailing newline,
        // and directly adjacent to another fenced block) `node.to - 1`
        // is always strictly greater than `node.from` and always still
        // within the closing fence line's own `[from, to)` span — line
        // membership is decided by each line's own *start* position
        // (`TileBuilder.getBlockPos`, called once per line), which is
        // never affected by shrinking the wrapper's own end by a single
        // trailing character. This has no effect on `fencedCodeBlockLineDecoration.ts`'s
        // `--first`/`--last` computation, which reads the real `node.to`
        // directly and is entirely independent of this wrapper's own
        // range.
        ranges.push(fencedCodeBlockWrapperFor(view, node).range(node.from, node.to - 1));
      },
    });
  }

  return ranges;
}

export function fencedCodeBlockWrapper(): Extension {
  return EditorView.blockWrappers.of((view) =>
    BlockWrapper.set(buildFencedCodeBlockWrappers(view), true)
  );
}
