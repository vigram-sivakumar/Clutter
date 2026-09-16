import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { BLOCK_SPACING_PARTICIPANTS } from './blockSpacingParticipants';
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
 */
function buildLineBoundarySeparators(state: EditorState): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  for (let n = 2; n <= state.doc.lines; n++) {
    const prevProbe = lineProbePos(state, n - 1);
    const probe = lineProbePos(state, n);
    const height = resolveBoundaryHeight(state, prevProbe, probe);
    const separator = separatorRange(height, state.doc.line(n).from, -1);
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
