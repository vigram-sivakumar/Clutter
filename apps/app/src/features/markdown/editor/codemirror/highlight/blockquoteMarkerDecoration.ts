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

import type { TokenNodeRange } from '../semanticToken/tokenEngagement';
import { isPhysicalLineEngaged } from './liveMarkDecoration';

/**
 * `>` marker rendering — deliberately NOT built on the shared
 * `liveMarkDecoration` mechanism heading uses, per the 2026-08-27 DOM
 * structure direction: the marker must be a real `Decoration.mark`
 * wrapping the actual `QuoteMark` character (concealed via styling within
 * that same span when unengaged), never a `Decoration.replace` swapping
 * it for a widget or removing it from the DOM. `liveMarkDecoration`
 * exists specifically to do the latter — reusing it here would mean
 * either changing its behavior (risking heading, which must keep its
 * current replace-based concealment) or fighting it. A separate,
 * blockquote-only mechanism keeps heading byte-for-byte unaffected.
 *
 * Known, deliberate tradeoff, not an oversight: keeping the real `>`
 * character in the DOM (CSS-concealed rather than removed) is exactly
 * the pattern `liveMarkDecoration.ts`'s own doc comment documents as
 * *rejected* for every other construct in this codebase — a CSS-hidden
 * live text node can still participate in native click hit-testing and
 * double-click word-selection at the hidden/visible boundary. Adopting it
 * here anyway was an explicit instruction (this file's PR), not
 * independently discovered as safe; flagged for real-app verification
 * rather than asserted as risk-free. `liveMarkSelectionSnap.ts` — built
 * to correct exactly that boundary ambiguity for a *replaced* zero-width
 * range — does not apply here and is deliberately not wired: there is no
 * zero-width range to correct for, since the marker is always real,
 * present text.
 *
 * Two decoration kinds, over the same tree walk `getBlockquoteMarkRanges`
 * already used to establish (unchanged): a `Decoration.mark` per marker
 * range (class `cm-quote-marker`, plus a `--concealed` modifier class
 * when unengaged) and a second `Decoration.mark` per physical line's
 * remaining content (class `cm-quote`) — the two-span structure
 * (`marker span → content span`, no enclosing wrapper) the DOM agreement
 * calls for. Engagement is per physical line (`isPhysicalLineEngaged`,
 * called per-mark, not per-node) — the exact fix already established for
 * blockquote's cross-line leak (a `Blockquote` node's own marker set can
 * legitimately span more than one physical line via CommonMark lazy
 * continuation; see that function's own callers elsewhere for the full
 * trace). Reused here, not re-derived.
 */
const isBlockquoteNode = (nodeName: string): boolean => nodeName === 'Blockquote';

function markerRanges(node: SyntaxNode, state: EditorState): TokenNodeRange[] {
  const ranges: TokenNodeRange[] = [];

  // One combined range per marker occurrence — the `>` plus its own
  // trailing separator space, if present — not two adjacent ranges. Two
  // separate `Decoration.mark`s here would render as two separate sibling
  // spans (confirmed by direct test failure: `['>', ' ']` instead of a
  // single `'> '`), which is not the one-marker-span-per-`>` structure
  // this file's own doc comment describes.
  function withSeparator(mark: SyntaxNode): void {
    const separatorFrom = mark.to;
    const separatorTo = separatorFrom + 1;
    const hasSeparator =
      separatorTo <= state.doc.length && state.sliceDoc(separatorFrom, separatorTo) === ' ';

    ranges.push({ from: mark.from, to: hasSeparator ? separatorTo : mark.to });
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'QuoteMark') {
      withSeparator(child);
      continue;
    }

    if (child.name === 'Blockquote') {
      // A nested quote is a separate construct, handled by its own pass.
      continue;
    }

    // Lazy continuation: a later line's `QuoteMark` lands inside the
    // Paragraph its text belongs to, one level deeper than the first
    // line's own `QuoteMark`.
    for (let grandchild = child.firstChild; grandchild; grandchild = grandchild.nextSibling) {
      if (grandchild.name === 'QuoteMark') {
        withSeparator(grandchild);
      }
    }
  }

  return ranges;
}

const MARKER_MARK = Decoration.mark({ class: 'cm-quote-marker' });
const MARKER_MARK_CONCEALED = Decoration.mark({
  class: 'cm-quote-marker cm-quote-marker--concealed',
});
const CONTENT_MARK = Decoration.mark({ class: 'cm-quote' });

interface PendingMark {
  from: number;
  to: number;
  decoration: ReturnType<typeof Decoration.mark>;
}

function buildDecorations(view: EditorView): DecorationSet {
  const pending: PendingMark[] = [];
  // Per physical line (keyed by line.from): the furthest `.to` reached by
  // any of that line's own marker ranges — content on that line starts
  // there, or at the line's own start if it carries no marker at all
  // (lazy continuation with no repeated `>`).
  const markerEndByLine = new Map<number, number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isBlockquoteNode(node.name)) {
          return;
        }

        for (const range of markerRanges(node.node, view.state)) {
          const engaged = isPhysicalLineEngaged(view.state, [range]);
          pending.push({
            from: range.from,
            to: range.to,
            decoration: engaged ? MARKER_MARK : MARKER_MARK_CONCEALED,
          });

          const lineFrom = view.state.doc.lineAt(range.from).from;
          const current = markerEndByLine.get(lineFrom) ?? -1;
          if (range.to > current) {
            markerEndByLine.set(lineFrom, range.to);
          }
        }
      },
    });
  }

  // Content marks: one per physical line a Blockquote owns, from that
  // line's own marker end (or its own start, if it has no marker) to the
  // line's end. Ownership reuses the same probe `blockquoteLineDecoration.ts`
  // uses (nearest `Blockquote` ancestor at the first non-whitespace
  // character) rather than re-deriving it from `markerEndByLine` alone,
  // since a lazily-continued line can be owned by a Blockquote while
  // contributing no entry to that map at all.
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const leading = line.text.length - line.text.trimStart().length;
      const probePos = line.from + leading;

      let owned = false;
      for (
        let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(probePos, 1);
        node;
        node = node.parent
      ) {
        if (node.name === 'Blockquote') {
          owned = true;
          break;
        }
      }

      if (owned) {
        const contentFrom = markerEndByLine.get(line.from) ?? line.from;
        if (contentFrom < line.to) {
          pending.push({ from: contentFrom, to: line.to, decoration: CONTENT_MARK });
        }
      }

      pos = line.to + 1;
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, decoration } of pending.sort((a, b) => a.from - b.from || a.to - b.to)) {
    builder.add(from, to, decoration);
  }
  return builder.finish();
}

interface BlockquoteMarkerPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function blockquoteMarkerDecoration(): Extension {
  return ViewPlugin.fromClass<BlockquoteMarkerPlugin>(
    class implements BlockquoteMarkerPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
