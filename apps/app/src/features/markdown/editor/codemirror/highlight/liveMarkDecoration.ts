import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';

import {
  isTokenEngaged,
  type TokenNodePredicate,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';
import { liveMarkSelectionSnap } from './liveMarkSelectionSnap';

/**
 * Shared "ordinary Live-Preview mark" hide-on-rest mechanism, generalized
 * from the heading- and emphasis-specific decorations that each
 * independently (and incorrectly) hid markers via CSS `display: none` on
 * an ordinary `Decoration.mark`. That approach leaves a real, live text
 * node in the DOM with a collapsed `(0,0,0,0)` layout rect — confirmed
 * directly (not assumed) by mounting the production `MarkdownEditor` in a
 * real browser and inspecting `getBoundingClientRect()` on the hidden
 * spans. A `display:none` text node still participates in the browser's
 * native hit-testing and word-selection model even though it renders
 * nothing, which produces exactly the two symptoms this mechanism fixes:
 * a click landing at an ambiguous pixel near the hidden/visible boundary
 * can resolve to either side of the hidden run (cursor lands before the
 * marker instead of inside the revealed text), and double-click word
 * selection walks the real DOM text and sweeps the hidden marker text
 * into the selection along with the word.
 *
 * The fix, per the already-decided direction in
 * docs/editor-architecture-decisions.md's "Verified against installed
 * APIs" section ("ordinary Live-Preview-hidden inline marks ... Both use
 * `Decoration.replace`/`WidgetType`; only tokens additionally register in
 * `atomicRanges`"): collapse the marker range with `Decoration.replace({})`
 * — no widget, nothing rendered, and critically no DOM text node left
 * behind for the browser to hit-test against — rather than styling it
 * invisible. Deliberately **not** registered in `EditorView.atomicRanges`:
 * that's reserved for at-rest semantic tokens (`semanticToken/tokenDecorations.ts`),
 * where atomic whole-range deletion is the desired behavior; an ordinary
 * hidden formatting marker must stay individually deletable, matching the
 * same validated distinction that document already draws.
 *
 * Engagement (whether a construct's markers should currently render) is
 * the exact same selection-containment query every semantic inline
 * construct already uses (`isTokenEngaged`, `semanticToken/tokenEngagement.ts`)
 * — node granularity, not `.cm-activeLine` line granularity. A single
 * line can hold more than one marked-up span (`*a* and *b*`), so only the
 * one the selection is actually in or adjacent to should reveal.
 *
 * `getMarkRanges` supplies the one per-construct fact this mechanism
 * doesn't know: which character ranges within an unengaged construct
 * node count as "marker" and should collapse. Everything else — the
 * engagement query, the tree walk, sorting collapsed ranges into a valid
 * `DecorationSet` even when constructs nest (`***bold italic***`, where a
 * `StrongEmphasis`'s own marks sit strictly inside its enclosing
 * `Emphasis`'s range, visited out of left-to-right order by `iterate`) —
 * is shared.
 */
export type MarkRangeSelector = (
  node: SyntaxNodeRef,
  state: EditorState
) => readonly TokenNodeRange[];

function buildDecorations(
  view: EditorView,
  isConstructNode: TokenNodePredicate,
  getMarkRanges: MarkRangeSelector
): DecorationSet {
  const collapsed: TokenNodeRange[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isConstructNode(node.name)) {
          return;
        }

        const range: TokenNodeRange = { from: node.from, to: node.to };
        if (isTokenEngaged(view.state, range)) {
          return;
        }

        collapsed.push(...getMarkRanges(node, view.state));
      },
    });
  }

  // Sorted once via Decoration.set(_, true) rather than inserted in tree
  // visitation order via RangeSetBuilder: a nested construct's outer marks
  // are visited before its inner construct's own (earlier-positioned)
  // marks, which RangeSetBuilder's strictly-ascending insertion rejects.
  return Decoration.set(
    collapsed.map(({ from, to }) => Decoration.replace({}).range(from, to)),
    true
  );
}

interface LiveMarkPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function liveMarkDecoration(
  isConstructNode: TokenNodePredicate,
  getMarkRanges: MarkRangeSelector
): Extension {
  const decorations = ViewPlugin.fromClass<LiveMarkPlugin>(
    class implements LiveMarkPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, isConstructNode, getMarkRanges);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, isConstructNode, getMarkRanges);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );

  // Every construct routed through this shared mechanism gets the click
  // boundary fix (liveMarkSelectionSnap.ts) for free, from the exact same
  // (isConstructNode, getMarkRanges) it already supplies for hiding the
  // markers in the first place — no construct-specific wiring anywhere.
  return [decorations, liveMarkSelectionSnap(isConstructNode, getMarkRanges)];
}
