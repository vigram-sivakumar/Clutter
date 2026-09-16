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
 * **Why replace, not a point widget, for this one boundary**: CM6's
 * `TileBuilder.updateBlockWrappers` (confirmed against the installed
 * `@codemirror/view` source) activates a `BlockWrapper` — the real DOM
 * parent `fencedCodeBlockWrapper.ts` gives a `FencedCode` node — the
 * moment its own builder-position counter reaches the wrapper's `.from`,
 * inclusively. A zero-width `Decoration.widget` placed at exactly that
 * position consumes no document characters, so the counter is still
 * sitting on `.from` when the widget is emitted — the wrapper is already
 * "active," and the widget is appended as its first child instead of
 * rendering as an ordinary top-level sibling before it. A `Decoration.replace`
 * over the connecting newline has real width, so `addBlockWidget`'s own
 * `this.pos += widget.length` genuinely advances the counter by one
 * *through* the widget: while it's being placed, the counter is still one
 * position *before* the wrapper's `.from` (not active yet, so the widget
 * renders as a plain sibling); afterward it lands exactly on `.from` for
 * the *first* time, when the real fence content opens its own single
 * wrapper. Nothing here reads or changes `fencedCodeBlockWrapper.ts`'s own
 * range computation — this only changes how the separator's own
 * decoration is shaped for the one boundary where their positions
 * otherwise coincide.
 *
 * **`inclusiveEnd: false`, explicit, load-bearing.** `Decoration.replace`
 * defaults `inclusiveEnd` to `block`'s own value when unspecified
 * (confirmed in the installed source's `getInclusive`) — so a `block: true`
 * replace is inclusive-at-both-ends by default. Left at that default, CM6's
 * `RangeSet.spans` traversal silently drops an immediately-following
 * zero-width point decoration positioned at this decoration's own `to` —
 * which is exactly where `fencedCodeBlockLineDecoration.ts` places the
 * `Decoration.line()` carrying the fence's own `--first` class. Setting
 * `inclusiveEnd: false` avoids that drop; it has no bearing on the
 * wrapper-activation fix above, which depends only on `this.pos`'s plain
 * integer position, never on a decoration's side/inclusivity.
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
 * **Line `n` opening a `FencedCode` node's own unindented span is placed
 * via `separatorRangeReplacing`, not the ordinary point-widget form.**
 * `fencedCodeBlockWrapper.ts` gives every `FencedCode` node a real DOM
 * wrapper for its own `[from, to)` range; when line `n`'s own `.from`
 * equals that node's `.from` (no leading indentation), the ordinary
 * zero-width widget used everywhere else in this function would land
 * exactly on the wrapper's own boundary and get absorbed into it as a
 * spurious extra child — see `separatorRangeReplacing`'s own doc comment
 * for the exact mechanism and the fix. `nearestFencedCode` (this module's
 * only fenced-code import — a pure, read-only syntax-tree query owned by
 * `fencedCodeBlockLineDecoration.ts`) is consulted only to decide *which
 * decoration shape this file's own separator should use*; nothing about
 * `fencedCodeBlockWrapper.ts`'s range computation, or any other
 * fenced-code file, is read or changed.
 */
function buildLineBoundarySeparators(state: EditorState): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  for (let n = 2; n <= state.doc.lines; n++) {
    const prevProbe = lineProbePos(state, n - 1);
    const probe = lineProbePos(state, n);
    const height = resolveBoundaryHeight(state, prevProbe, probe);
    const line = state.doc.line(n);
    const fencedCodeEntry = nearestFencedCode(state, line.from);
    const separator =
      fencedCodeEntry && fencedCodeEntry.from === line.from
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
