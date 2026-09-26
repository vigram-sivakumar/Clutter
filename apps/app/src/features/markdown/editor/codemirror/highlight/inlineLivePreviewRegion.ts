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

import { isTokenEngaged, widenThroughFlushAncestors } from '../semanticToken/tokenEngagement';
import { revealedMarkNodeRanges, type ParticipantRenderer } from './inlineLivePreviewParticipants';

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
 * visibility. Originally built per the Inline Live Preview Region ODR
 * (docs/editor-research/inline-live-preview-region-odr-v1.md); its central
 * "ancestor-or-self engaged ⇒ whole region is source" rule is **superseded
 * below (2026-09-26 correction)** — see docs/editor-architecture-decisions.md's
 * correction entry of that name for the full investigation. Supersedes
 * `emphasisLivePreview.ts` (Emphasis/StrongEmphasis) and
 * `strikethroughLivePreview.ts` (Strikethrough), both retired in the same
 * commit that introduced this file — that history is unaffected by the
 * correction below.
 *
 * **Corrected rule (2026-09-26): each participant node resolves its own
 * engagement independently.** The original rule — a directly-engaged
 * participant is a "region root" whose entire subtree renders as source,
 * with no descendant participant ever running — was confirmed to cause a
 * generic bug: a WikiLink, Tag, Link, or ordinary formatted span sitting
 * anywhere inside an engaged ancestor (`**bold text [[Page]] #tag more**`
 * with the caret in "bold text") lost its own rendering — becoming raw,
 * un-clickable Markdown — purely because the caret was somewhere *else*
 * inside the same ancestor, never because the caret came anywhere near
 * that construct itself. The fix removes the "region root" concept
 * entirely: a participant's own engagement is decided from its own range,
 * widened only through a flush (zero-gap, no-sibling) chain of enclosing
 * delimited-mark ancestors ({@link widenThroughFlushAncestors}) — never
 * simply "is some ancestor's range, anywhere, engaged." An engaged
 * participant reveals only *its own* markers
 * ({@link revealedMarkNodeRanges}) and traversal *continues descending*
 * into its children (no `return false`), so every nested participant —
 * marker-hiding or widget-replace alike — independently decides its own
 * preview/source state from the same caret position, exactly as it would
 * if the ancestor weren't there at all.
 *
 * Concretely, for `~~**a** and **b**~~` with the caret inside `**a**`:
 * Strikethrough is engaged (caret is within its own range) and reveals its
 * `~~` marks; `**a**` is independently engaged (caret is within *its* own
 * range too) and reveals its `**` marks; `**b**` is independently *not*
 * engaged (the caret never entered its range, and it shares no flush
 * boundary with Strikethrough to inherit through) and renders normally,
 * still bold. This replaces the old accepted consequence "siblings inside
 * an engaged ancestor also render as source," which is no longer true by
 * design — it was the symptom, not a tolerated trade-off.
 *
 * **Why "flush ancestors," not "no widening at all" ({@link
 * widenThroughFlushAncestors}'s own doc comment has the full mechanism):**
 * a bare per-node check alone reopens a *different*, already-fixed
 * regression — `**[[Page]]**` (WikiLink is the construct's *entire*
 * content, zero gap on both sides) needs a caret at the outer `**`
 * boundary to still show the whole thing as one coherent unit (fully raw,
 * or fully the compact widget), never a broken `**` + still-compact-widget
 * seam. Widening is preserved for exactly that zero-gap-on-both-sides
 * case and nowhere else — the moment real sibling content exists on
 * either side (the general case this correction is for), the widen
 * doesn't apply and each construct is independent.
 *
 * **How one downward pass computes that, with no ancestor walking beyond
 * the flush check and no stored state:**
 *  - Non-participants are transparent: keep descending.
 *  - A participant that is engaged (bare range, or flush-widened) reveals
 *    only its own marker children via `revealedMarkNodeRanges` (a no-op
 *    for the widget-replace family and bare `URL`, which have no markers
 *    of their own) and keeps descending — no `tok-*` content class, no
 *    widget, no atomic range for *this* node, but every descendant gets
 *    its own independent chance to render normally.
 *  - A participant that is not engaged emits its own concealing
 *    decorations (marker replace + content class, or widget replace) via
 *    its registered `render`, and descent continues exactly as before —
 *    unchanged from every prior phase.
 *
 * Ranges are collected into an array and sorted once via
 * `Decoration.set(ranges, true)` rather than inserted in visitation order
 * via `RangeSetBuilder`: a nested construct's outer content range is
 * pushed before the inner node's own, earlier-positioned ranges, which
 * `RangeSetBuilder.add`'s strictly-non-decreasing-`from` requirement
 * rejects but `Decoration.set(_, true)` sorts and tolerates.
 *
 * **Out of scope, deliberately:** block-level rendering (heading/list/
 * blockquote markers are line-scoped, not subtree-scoped, and keep their
 * existing owner); `liveMarkSelectionSnap`'s `transactionFilter` (neither
 * introduced nor removed here); `Task` (fused into block-level list
 * rendering); and the known whole-document initial-caret limitation, where
 * a construct spanning the entire document loads revealed because
 * `createEditorView.ts` seeds the caret at `doc.length`, an inclusive
 * boundary. That limitation is unrelated to nesting and is pinned, not
 * solved, in this file's test suite.
 *
 * **`atomicRanges`:** derived from the *same* single traversal as
 * `decorations`, never by inspecting the merged decoration set afterward.
 * Each participant's renderer already returns `{decorations, atomic?}`
 * (`inlineLivePreviewParticipants.ts`) — `atomic` is present only for the
 * widget-replace family (`WikiLink`/`Tag`/`Date`), absent for ordinary
 * marker-hiding participants, so "is this atomic" is a per-participant-owned
 * fact read at the source, not a property re-derived from the shape of the
 * final `DecorationSet`. An engaged participant's `render` is never called
 * at all (the engaged branch returns before reaching it), so neither its
 * `decorations` nor its `atomic` range is ever emitted for that one
 * occurrence — but, per the correction above, this now only withholds the
 * *engaged node's own* atomic range, never a nested descendant's: a Tag
 * sitting inside an engaged-but-not-flush ancestor stays atomic, exactly
 * as it stays a rendered widget.
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

        if (isTokenEngaged(view.state, widenThroughFlushAncestors(node.node))) {
          // Engaged: reveal only this node's own marker children (a no-op
          // for the widget-replace family and bare URL, which have none)
          // and keep descending — no `return false`. Every nested
          // participant gets its own independent engagement check against
          // the same caret position, so a sibling or descendant elsewhere
          // in this engaged construct is never forced raw merely because
          // this ancestor is engaged. See this function's own doc comment
          // ("Corrected rule (2026-09-26)") for the full rationale and
          // docs/editor-architecture-decisions.md's correction entry for
          // the investigation this replaces.
          ranges.push(...revealedMarkNodeRanges(node.node));
          return;
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
