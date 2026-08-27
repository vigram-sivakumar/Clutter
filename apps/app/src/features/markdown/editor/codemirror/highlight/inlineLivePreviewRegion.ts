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
import { revealedMarkerRanges, type ParticipantRenderer } from './inlineLivePreviewParticipants';

/**
 * Heading content classing (`tok-heading1`-`tok-heading6`), folded into
 * this shared decoration source per docs/editor-architecture-decisions.md's
 * "Heading content classing moved into the shared decoration source"
 * correction entry. Previously a second, independent `syntaxHighlighting()`
 * extension (`headingHighlighting()`) — which composed *incorrectly*
 * whenever a heading's inline content also contained a participant from
 * this shared set (Highlight, Emphasis, Link, ...): two independent
 * decoration sources targeting overlapping ranges split/nest by
 * registration precedence rather than merging, confirmed empirically to
 * produce `<span class="tok-highlight"><span class="tok-heading1">` instead
 * of one correctly-nested composition.
 *
 * Deliberately **not** a `participants` map entry: that contract's
 * engagement short-circuit (`isTokenEngaged` on the node's own range →
 * `return false`, stop descending, nothing inside decorates) is for
 * reveal-on-engage marker-hiding constructs. Heading content is never
 * concealed — only the marker is, via `headingMarkerDecoration.ts`'s own
 * independent, line-scoped mechanism, left entirely unchanged here.
 * Registering headings as participants would make the *entire* heading,
 * including any nested Highlight/Bold/Link inside it, stop decorating and
 * stop independently engaging the moment the cursor is anywhere on that
 * line — confirmed by prototyping that exact mistake before rejecting it.
 * So this stays a small unconditional branch that always emits the class
 * and always keeps descending, letting nested participants engage exactly
 * as before this existed.
 *
 * Range: the full node range (marker included), matching prior
 * `headingHighlighting()` behavior exactly, including the "revealed marker
 * renders at heading size" artifact — not a scope this change tries to fix.
 * `inclusiveStart`/`inclusiveEnd: true` for the same reason every other
 * wrapping participant in this file needs it: a heading whose entire
 * content is one other participant (`# [[Page]]`, `# ==Heading==`) has an
 * exactly-coincident range with that participant's own decoration, and
 * without the inclusive flags CM6 splits instead of nesting them.
 */
const HEADING_CLASS_BY_NODE_NAME: ReadonlyMap<string, string> = new Map([
  ['ATXHeading1', 'tok-heading1'],
  ['ATXHeading2', 'tok-heading2'],
  ['ATXHeading3', 'tok-heading3'],
  ['ATXHeading4', 'tok-heading4'],
  ['ATXHeading5', 'tok-heading5'],
  ['ATXHeading6', 'tok-heading6'],
  ['SetextHeading1', 'tok-heading1'],
  ['SetextHeading2', 'tok-heading2'],
]);

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
 *    `false` so `iterate` never descends into it *as ordinary traversal*.
 *    No descendant's `render`/participant path ever runs, so nothing
 *    inside can emit a conflicting `tok-*`/widget/atomic decoration, and
 *    the whole region still renders as source. Correction (see docs/
 *    editor-architecture-decisions.md's nested-visibility entry): the
 *    engaged branch does perform one additional, separate subtree walk
 *    purely to discover nested marker-contract constructs' own marker
 *    ranges (`revealedMarkerRanges`) — this is not "ordinary traversal
 *    resuming," never calls a participant renderer, and changes nothing
 *    about which region is source vs. preview.
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
 * and keep their existing owner); `liveMarkSelectionSnap`'s
 * `transactionFilter` (neither introduced nor removed here); `Task`
 * (fused into block-level list rendering, out of scope per ODR §4.10 —
 * its inclusion in the ODR's own §10 Phase 3 text is a recorded
 * erratum); and the known whole-document initial-caret limitation, where
 * a construct spanning the entire document loads revealed because
 * `createEditorView.ts` seeds the caret at `doc.length`, an inclusive
 * boundary. That limitation is unrelated to nesting and is pinned, not
 * solved, in this file's test suite.
 *
 * **`atomicRanges` (Phase 3, ODR §10 as revised):** derived from the
 * *same* single traversal as `decorations`, never by inspecting the
 * merged decoration set afterward. Each participant's renderer already
 * returns `{decorations, atomic?}` (`inlineLivePreviewParticipants.ts`)
 * — `atomic` is present only for the widget-replace family (`WikiLink`/
 * `Tag`/`Date`), absent for ordinary marker-hiding participants, so "is
 * this atomic" is a per-participant-owned fact read at the source, not a
 * property re-derived from the shape of the final `DecorationSet`. When a
 * region is engaged, the traversal returns `false` *before* calling any
 * renderer — so neither a widget's `decorations` nor its `atomic` range
 * is ever emitted for an engaged occurrence, automatically, from the same
 * short-circuit that already governs ordinary participants. The
 * visibility algorithm itself (`isTokenEngaged` → `return false` →
 * render) is unchanged from Phases 1–2.
 */
function buildDecorations(
  view: EditorView,
  participants: ReadonlyMap<string, ParticipantRenderer>
): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const headingClass = HEADING_CLASS_BY_NODE_NAME.get(node.name);
        if (headingClass) {
          if (node.from < node.to) {
            ranges.push(
              Decoration.mark({
                class: headingClass,
                inclusiveStart: true,
                inclusiveEnd: true,
              }).range(node.from, node.to)
            );
          }
          // Not a reveal-on-engage participant — always keep descending,
          // regardless of selection, so nested participants (Highlight,
          // Emphasis, Link, ...) are still visited and independently
          // engaged exactly as before this branch existed.
          return;
        }

        const render = participants.get(node.name);
        if (!render) {
          // Not a participant — transparent to this mechanism. Keep
          // descending: a participant may sit anywhere beneath it.
          return;
        }

        if (isTokenEngaged(view.state, { from: node.from, to: node.to })) {
          // Region root. `return false` still stops ordinary traversal
          // from resuming below this point — no descendant participant
          // renderer runs, so no `tok-*` content decoration, no widget,
          // no atomic range is ever produced inside an engaged region.
          // That half of region atomicity (docs/editor-architecture-
          // decisions.md's "Nested inline Live Preview visibility") is
          // completely unchanged.
          //
          // What differs from a bare `return false`: `revealedMarkerRanges`
          // performs its own separate, narrowly-scoped walk over this
          // node's subtree (same tree, same call), discovering every
          // marker-contract construct nested inside — not just this
          // node's own marks — and emitting each one's `cm-marker
          // cm-{construct}-marker` spans with no `--concealed` modifier.
          // This is the fix for the confirmed nested-marker bug: previously
          // only the region root's own two marks were reachable here, so
          // `***bold italic***` engaged showed the outer `Emphasis` marks
          // but never the nested `StrongEmphasis` marks. See
          // `revealedMarkerRanges`'s own doc comment in
          // inlineLivePreviewParticipants.ts for the full rationale,
          // including why this stays additive-only (no content decoration,
          // no widget, no atomic range) and a no-op for every construct not
          // registered in `MARKER_CONSTRUCTS`.
          ranges.push(...revealedMarkerRanges(node.node));
          return false;
        }

        const result = render(node, view.state);
        ranges.push(...result.decorations);
        if (result.atomic) {
          atomicRanges.push(...result.atomic);
        }
      },
    });
  }

  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
}

interface InlineLivePreviewRegionPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

export function inlineLivePreviewRegion(
  participants: ReadonlyMap<string, ParticipantRenderer>
): Extension {
  const plugin = ViewPlugin.fromClass<InlineLivePreviewRegionPlugin>(
    class implements InlineLivePreviewRegionPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(view, participants));
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(update.view, participants));
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );

  const atomic = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  return [plugin, atomic];
}
