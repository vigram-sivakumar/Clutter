import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

import { isTokenEngaged } from '../semanticToken/tokenEngagement';
import { inlineLivePreviewParticipants } from './inlineLivePreviewParticipants';

/**
 * The single authoritative mechanism for resolving inline Live Preview
 * visibility, per the Inline Live Preview Region ODR
 * (docs/editor-research/inline-live-preview-region-odr-v1.md). Supersedes
 * `emphasisLivePreview.ts` (Emphasis/StrongEmphasis) and
 * `strikethroughLivePreview.ts` (Strikethrough), both retired in the same
 * commit that introduced this file.
 *
 * **Why those two were replaced rather than coordinated (ODR §1, §8):**
 * each ran its own traversal and asked `isTokenEngaged` about its own node
 * kinds only, so neither could observe that it was participating in one
 * nested formatting region. With the caret between an outer `~~` and an
 * inner `__` in `~~__Text__~~`, the outer Strikethrough revealed while the
 * inner StrongEmphasis stayed concealed — a half-preview/half-source state
 * verified in the real app. `emphasisLivePreview`'s traversal
 * short-circuit was already structurally correct; its *scope* was not —
 * it protected exactly the node kinds that happened to share one file.
 * The scope of a visibility decision is a grammar fact (which kinds can
 * nest inside which), never an implementation fact (how the code is split
 * across files). ODR §4.6 locks that; this file is where it is enforced.
 *
 * **The rule (ODR §3, §4.1):** a node renders as *source* if and only if
 * some visibility-participating **ancestor-or-self** is directly engaged.
 * "Directly engaged" is the existing, unmodified `isTokenEngaged`
 * containment check (ODR §4.3) — this file changes *which nodes it is
 * asked about and in what order*, never what it means.
 *
 * **How one downward pass computes that (ODR §5), with no ancestor
 * walking and no stored state:**
 *  - Non-participants are transparent: keep descending.
 *  - A participant that *is* directly engaged is the region root — return
 *    `false` so `iterate` never descends into it. Nothing inside is
 *    visited, so nothing inside can emit a conflicting decoration, so the
 *    whole region renders as source.
 *  - A participant that is *not* engaged emits its own concealing
 *    decorations and descent continues. By the containment invariant
 *    (every nested participant's range is a strict subset of its
 *    ancestor's), a selection outside the ancestor's range is necessarily
 *    outside every descendant's, so each descendant's own check
 *    independently and correctly comes out disengaged too.
 *
 * Those two cases are exhaustive, which is what makes a region always
 * wholly preview or wholly source (ODR §4.4) without any construct-pair
 * logic, precedence table, or knowledge of what kind an ancestor is.
 *
 * *Accepted consequence of §4.4, recorded because it can surprise:*
 * sibling constructs inside an engaged ancestor also render as source —
 * with the caret inside `**a**` in `~~**a** and **b**~~`, the caret lies
 * within the enclosing Strikethrough, so `**b**` reveals too. The region,
 * not the word, is the unit.
 *
 * Ranges are collected into an array and sorted once via
 * `Decoration.set(ranges, true)` rather than inserted in visitation order
 * via `RangeSetBuilder`: a nested construct's outer content range is
 * pushed before the inner node's own, earlier-positioned ranges, which
 * `RangeSetBuilder.add`'s strictly-non-decreasing-`from` requirement
 * rejects but `Decoration.set(_, true)` sorts and tolerates.
 *
 * **Out of scope, deliberately (ODR §7, §10):** block-level rendering
 * (heading/list/blockquote markers are line-scoped, not subtree-scoped,
 * and keep their existing owner); `atomicRanges` (this mechanism registers
 * none — Phase 3's concern); `liveMarkSelectionSnap`'s `transactionFilter`
 * (neither introduced nor removed here); and the known whole-document
 * initial-caret limitation, where a construct spanning the entire document
 * loads revealed because `createEditorView.ts` seeds the caret at
 * `doc.length`, an inclusive boundary. That limitation is unrelated to
 * nesting and is pinned, not solved, in this file's test suite.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const render = inlineLivePreviewParticipants.get(node.name);
        if (!render) {
          // Not a participant — transparent to this mechanism. Keep
          // descending: a participant may sit anywhere beneath it.
          return;
        }

        if (isTokenEngaged(view.state, { from: node.from, to: node.to })) {
          // Region root. Do not descend — the entire region renders as
          // source, so nothing inside it decorates.
          return false;
        }

        ranges.push(...render(node, view.state));
      },
    });
  }

  return Decoration.set(ranges, true);
}

interface InlineLivePreviewRegionPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function inlineLivePreviewRegion(): Extension {
  return ViewPlugin.fromClass<InlineLivePreviewRegionPlugin>(
    class implements InlineLivePreviewRegionPlugin {
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
