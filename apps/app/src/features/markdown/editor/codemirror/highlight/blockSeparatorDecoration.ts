import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { BLOCK_SPACING_PARTICIPANTS } from './blockSpacingParticipants';
import { nearestFencedCode } from './fencedCodeBlockLineDecoration';
import { lineProbePos, resolveBoundaryHeight, type SeparatorHeight } from './separatorScope';

/**
 * One shared, empty, fixed-height block widget for every separator this
 * file emits — genuinely CM6-measured geometry (per `@codemirror/view`'s
 * own `WidgetDecorationSpec.block` doc comment: block-level decorations
 * participate in the editor's own height/position model), unlike
 * `margin` or CSS padding, neither of which this file uses. A widget was
 * specifically chosen over per-line CSS padding (an earlier version of
 * this system used `Decoration.line` classes for the physical-line case)
 * because a widget never touches any `.cm-line`'s own CSS properties —
 * confirmed by direct live-rendering comparison that a padding class
 * competing with `FencedCode`'s own `--first`/`--last` card-inset
 * padding on the same longhand property silently loses the cascade,
 * while a widget's own height is entirely unaffected by whatever
 * padding a neighboring line carries. That's what let `FencedCode` join
 * `separatorScope.ts`'s atomic set with no special-casing at all.
 */
class SeparatorWidget extends WidgetType {
  constructor(readonly height: Exclude<SeparatorHeight, 0>) {
    super();
  }

  override eq(other: SeparatorWidget): boolean {
    return other.height === this.height;
  }

  override toDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'cm-block-separator';
    dom.style.height = `${this.height}px`;
    return dom;
  }

  override get estimatedHeight(): number {
    return this.height;
  }
}

function separatorRange(height: SeparatorHeight, pos: number, side: -1 | 1): Range<Decoration> | null {
  if (height === 0) {
    return null;
  }
  return Decoration.widget({ widget: new SeparatorWidget(height), block: true, side }).range(pos);
}

/**
 * The same separator widget, placed via `Decoration.replace` over
 * `[from, to)` instead of `Decoration.widget`'s zero-width point form —
 * see {@link buildLineBoundarySeparators}'s own doc comment for exactly
 * when and why this variant is needed (a leading separator immediately
 * before a `FencedCode` node's own unindented entry line).
 *
 * **`inclusiveEnd: false`, explicit, load-bearing.** `Decoration.replace`
 * defaults `inclusiveEnd` to `block` (confirmed against the installed
 * `@codemirror/view` source's `getInclusive` — a `block: true` replace is
 * inclusive-at-both-ends unless told otherwise), which gives this
 * decoration's own `endSide` a large *positive* value. Left at that
 * default, CM6's `RangeSet.spans` traversal silently drops the very next
 * decoration when it is a *zero-width point at this decoration's own
 * `to`* — which is exactly what happens here: `fencedCodeBlockLineDecoration.ts`
 * places a zero-width `Decoration.line()` at that same position (`to` ===
 * the fenced block's own first line start) to carry `--first`. Confirmed
 * by isolated reproduction (a single combined decoration set, ruling out
 * any cross-extension-ordering explanation) and by instrumented tracing of
 * `TileBuilder`: the line decoration's own `point()` callback simply never
 * fires, even though the merged decoration set itself is correct (verified
 * via a direct facet dump) — a genuine `@codemirror/view` traversal edge
 * case, not anything this codebase computes wrong. Explicitly setting
 * `inclusiveEnd: false` flips `endSide` negative, which avoids the drop
 * entirely — verified directly (the fenced block's own first line keeps
 * both `cm-code-block-line` and `cm-code-block-line--first`) — while the
 * wrapper-collision fix above is completely unaffected (still exactly one
 * `.cm-code-block`, confirmed by the same test suite): the `endSide` sign
 * has no bearing on `TileBuilder.updateBlockWrappers`'s own reuse check,
 * which is a plain integer-position comparison, not a side comparison. No
 * `inclusiveStart` change was needed or made — only `inclusiveEnd` altered
 * the outcome in testing.
 */
function separatorRangeReplacing(height: SeparatorHeight, from: number, to: number): Range<Decoration> | null {
  if (height === 0) {
    return null;
  }
  return Decoration.replace({ widget: new SeparatorWidget(height), block: true, inclusiveEnd: false }).range(from, to);
}

function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

function nearestParticipant(state: EditorState, probePos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (BLOCK_SPACING_PARTICIPANTS.has(node.name)) {
      return node;
    }
  }
  return null;
}

/**
 * Every physical-line boundary in the document — the general case,
 * covering ordinary paragraphs (including a `Paragraph`'s own multiple
 * physical lines, which get no special treatment here — see
 * `resolveBoundaryHeight`'s own doc comment), blank lines, and entry/exit
 * of every grouping/atomic construct, uniformly, via one comparison per
 * adjacent line pair. This is also what makes empty-line editing stable:
 * the boundary is defined by line *position*, which typing into an
 * existing line never changes, so a separator can never appear,
 * disappear, or move just because the user filled in a blank line —
 * only inserting or removing a line does.
 *
 * Runs over the whole document on every edit, not just the visible
 * viewport — a `StateField` has no `view.visibleRanges` to scope
 * against (only a `ViewPlugin` does, and block decorations can't come
 * from one), so this is a real, unmeasured cost for very long documents
 * that a future pass may want to address (e.g. incremental re-resolution
 * around the changed range instead of a full rebuild) rather than
 * something already solved here.
 *
 * **Fenced-code entry lines are placed differently — a `Decoration.replace`
 * over the connecting newline, not a `Decoration.widget` point at
 * `line(n).from`.** Reported bug: a leading separator immediately before a
 * `FencedCode` node's own unindented entry line rendered as its own empty,
 * rounded `.cm-code-block` box on top of the real one (equivalently: the
 * separator ended up a *child* of `.cm-code-block` instead of its sibling).
 *
 * Root cause, confirmed against the installed `@codemirror/view` source
 * (`TileBuilder.getBlockPos`/`updateBlockWrappers`), not guessed: CM6 folds
 * *any* block-level content sitting at a `BlockWrapper`'s own `.from` into
 * that wrapper — the check is a plain inclusive `cur.from <= this.pos`,
 * with no way to tell "this is the wrapper's own real content" apart from
 * "this is some unrelated widget that merely shares the same integer
 * position." A zero-width `Decoration.widget` point placed at exactly
 * `line(n).from` (which *is* the `FencedCode` node's own `.from` when line
 * `n` opens the block) is processed while the builder's own position
 * counter (`this.pos`) still equals that value — a widget consumes no
 * document characters, so `this.pos` never advances past it before the
 * real first fence line is processed at that *same* position. The
 * wrapper's own tile-reuse check (`wrap.from < this.pos`, strict) then
 * fails for *both* the widget and the real line in turn, so each opens its
 * *own* new `BlockWrapperTile` — two `.cm-code-block` elements for one
 * logical block, one of them containing only the separator.
 *
 * An earlier attempt anchored the separator one position earlier instead
 * (the previous line's own `.to`, still a `Decoration.widget` point) —
 * this does dodge the wrapper collision (the wrapper isn't active yet at
 * that position), but it anchors the widget *before* the real newline
 * character connecting the two lines, so CM6's own line-building (`emit`'s
 * `span` callback) is left with an orphaned newline it must still
 * represent somehow, and inserts a genuine synthetic empty `.cm-line` to
 * hold it — a real correctness regression (an extra document-position-less
 * line materializes in the DOM, with its own, incorrect effect on
 * click/selection coordinate mapping), not merely cosmetic. Reverted.
 *
 * The fix that satisfies both constraints at once: replace the newline
 * itself — `Decoration.replace({widget, block: true}).range(prevLine.to,
 * line(n).from)` — rather than inserting a zero-width point at either of
 * its two endpoints. A replace decoration's widget "length" equals the
 * span it replaces (here, exactly the one newline character), so
 * `addBlockWidget`'s `this.pos += widget.length` genuinely advances the
 * builder's position by one *through* the widget itself: while the widget
 * is being placed, `this.pos` is still `prevLine.to`, strictly *before*
 * the wrapper's own `.from` (`cur.from <= this.pos` fails — the wrapper
 * isn't active yet, so the widget renders as an ordinary top-level
 * sibling, never swept into any wrapper); immediately afterward, `this.pos`
 * lands exactly on `line(n).from`, which is the *first* time (not the
 * second) the wrapper's own condition is satisfied, so the real fence line
 * opens exactly one new `BlockWrapperTile`, cleanly. No orphaned newline
 * exists to trigger a synthetic line, because the replace decoration
 * itself already accounts for that character. Verified directly: DOM dump
 * shows the separator as a sibling of (never a child of, and never
 * duplicating) `.cm-code-block`, with `view.state.doc.lines` and every
 * physical line's own text completely unchanged (a decoration never
 * mutates the document) — see
 * `fencedCodeBlockWrapperSeparatorInteraction.test.ts` for the full
 * regression matrix, including live cursor/click-mapping and Option-Arrow
 * line-movement verification.
 *
 * Every other boundary (including the *exit* side of a fenced block, and
 * an *indented* fence nested in a list item, neither of which ever
 * coincides with the wrapper's own `.from`/`.to` in the first place) is
 * completely unaffected — this replace-based placement only ever applies
 * when line `n` is confirmed to be the exact physical line a `FencedCode`
 * node's own `.from` sits on.
 *
 * **One narrower case the replace fix cannot reach: two `FencedCode`
 * blocks directly adjacent with no blank line between them at all** (legal
 * CommonMark — a closing fence immediately followed by an opening fence
 * needs no blank line). Here the single newline separating them sits at
 * *both* the first block's own inclusive `.to` and the second block's own
 * `.from` simultaneously — there is no character position in that one-byte
 * gap that lies outside *both* wrappers' inclusive ranges, so any
 * decoration touching it (replace or point, either side) gets swept into
 * whichever wrapper's tile is already open (confirmed directly: the
 * replace fix's own widget ends up an *extra child* of the first block's
 * wrapper here, growing its visible border/shadow past its real content —
 * a materially different, smaller defect than the original bug, but still
 * not "outside both wrappers"). Filling that literal one-character gap
 * with real visual space would need `margin` on `.cm-code-block` (space
 * genuinely *outside* an element's own border) — permanently banned on
 * this exact element (this file's own module doc, `fencedCodeBlockWrapper.ts`'s
 * doc comment, and `CLAUDE.md`'s standing rule), confirmed by prior direct
 * testing to corrupt CM6 cursor/navigation; `padding` cannot substitute
 * here the way it does everywhere else in this system, because padding
 * added to *either* wrapper renders *inside* that wrapper's own border,
 * not between the two independent borders. Rather than accept either
 * defect (a duplicate wrapper, or a mis-bordered one), this one boundary
 * emits no separator at all — the two cards render directly touching,
 * borders visually distinct without a gap. `resolveBoundaryHeight` still
 * computes a real (typically 12px) height for this boundary, matching
 * every other case; it's deliberately never realized as a widget here,
 * the one narrow exception to "one shared boundary resolver, one shared
 * emission mechanism" in this whole file, and it exists only because no
 * CM6-native decoration mechanism can express "a widget between two
 * touching block wrappers, outside both" — confirmed against the
 * installed source, not assumed.
 */
function isDirectlyAdjacentFencedCodeEntry(state: EditorState, n: number): boolean {
  if (n < 2) {
    return false;
  }
  const line = state.doc.line(n);
  const owner = nearestFencedCode(state, line.from);
  if (!owner || owner.from !== line.from) {
    return false;
  }
  const prevLine = state.doc.line(n - 1);
  if (prevLine.text.trim() === '') {
    return false;
  }
  // Probed at `prevLine.from`, not `.to` — `nearestFencedCode` resolves
  // with a forward bias, which at a node's own exact `.to` boundary can
  // resolve to whatever *follows* the node instead of the node itself.
  // Any position within the previous line works equally well here (the
  // question is only "which FencedCode, if any, owns this whole line"),
  // and `.from` is never ambiguous the way an exact `.to` boundary is.
  const prevOwner = nearestFencedCode(state, prevLine.from);
  return prevOwner !== null && prevOwner.from !== owner.from;
}

function buildLineBoundarySeparators(state: EditorState): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  for (let n = 2; n <= state.doc.lines; n++) {
    if (isDirectlyAdjacentFencedCodeEntry(state, n)) {
      continue;
    }

    const prevProbe = lineProbePos(state, n - 1);
    const probe = lineProbePos(state, n);
    const height = resolveBoundaryHeight(state, prevProbe, probe);
    const line = state.doc.line(n);
    const owner = nearestFencedCode(state, line.from);
    const separator =
      owner && owner.from === line.from
        ? separatorRangeReplacing(height, state.doc.line(n - 1).to, line.from)
        : separatorRange(height, line.from, -1);
    if (separator) {
      ranges.push(separator);
    }
  }

  return ranges;
}

/**
 * Same-physical-line boundaries around an `Image`/`Embed` that shares
 * its line with real text (`before ![img](url) after`) — invisible to
 * {@link buildLineBoundarySeparators}, which only ever compares whole
 * lines to each other, never positions within one line. Uses the same
 * {@link resolveBoundaryHeight} rule (so an inline embed nested inside a
 * list/blockquote correctly gets 6px here too, not a hardcoded 12), and
 * the same widget/emission mechanism — this is the "one shared boundary
 * resolver, one shared emission mechanism" the physical-line and
 * same-line cases both go through, not two parallel implementations.
 */
function buildInlineParticipantSeparators(state: EditorState): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (!BLOCK_SPACING_PARTICIPANTS.has(node.name)) {
        return;
      }

      const line = state.doc.lineAt(node.from);

      const before = state.sliceDoc(line.from, node.from);
      if (before.trim().length > 0) {
        const height = resolveBoundaryHeight(state, line.from, node.from);
        const separator = separatorRange(height, node.from, -1);
        if (separator) {
          ranges.push(separator);
        }
      }

      const after = node.to <= line.to ? state.sliceDoc(node.to, line.to) : '';
      if (after.trim().length > 0) {
        const probePos = node.to + firstNonWhitespaceOffset(after);
        const following = nearestParticipant(state, probePos);
        const deferredToNextParticipant = following !== null && following.from === probePos;
        if (!deferredToNextParticipant) {
          const height = resolveBoundaryHeight(state, node.to, probePos);
          const separator = separatorRange(height, node.to, 1);
          if (separator) {
            ranges.push(separator);
          }
        }
      }
    },
  });

  return ranges;
}

function buildSeparators(state: EditorState): Range<Decoration>[] {
  return [...buildLineBoundarySeparators(state), ...buildInlineParticipantSeparators(state)];
}

/**
 * A `StateField`, not a `ViewPlugin` and not a view-dependent decorations
 * function — CM6 throws `RangeError: Block decorations may not be
 * specified via plugins` for either of those (confirmed directly against
 * the installed `@codemirror/view`). Block-level decorations must be
 * transaction-synchronized, unlike `EditorView.blockWrappers` (which does
 * accept a view function, per `fencedCodeBlockWrapper.ts`'s own doc
 * comment) — the two mechanisms are not interchangeable in what's
 * allowed to produce them.
 */
const blockSeparatorField = StateField.define<DecorationSet>({
  create(state) {
    return Decoration.set(buildSeparators(state), true);
  },
  update(value, tr) {
    if (tr.docChanged) {
      return Decoration.set(buildSeparators(tr.state), true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * The single, unified spacing system for the editor: resolves every
 * boundary — between physical lines, and between a same-line `Image`/
 * `Embed` and its flanking text — to a height (12/6/0, see
 * `separatorScope.ts`), and emits exactly one `Decoration.widget` when
 * that height is non-zero. Replaces the previous global
 * `.cm-line { padding-block: 3px }` rule entirely (see
 * `MarkdownEditor.css`'s `.cm-line` rule, now `padding-block: 0`) — there
 * is no second, padding-based spacing mechanism anywhere in the editor.
 */
export function blockSeparatorDecoration(): Extension {
  return blockSeparatorField;
}
