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

/**
 * Bold-only Live Preview vertical slice (docs/editor-architecture-decisions.md's
 * "Live-preview rendering architecture" section — Recommended, not locked;
 * this is the first, deliberately narrow proof of it).
 *
 * Deliberately does not reuse `liveMarkDecoration.ts`/`emphasisMarkerDecoration.ts`:
 * `liveMarkDecoration` unconditionally wires in `liveMarkSelectionSnap`, which
 * uses `EditorState.transactionFilter.of(...)` — out of scope per this slice's
 * explicit constraint against transactionFilter/changeFilter for rendering.
 * `isTokenEngaged` (`semanticToken/tokenEngagement.ts`) is reused as-is: it's a
 * pure selection-containment query with no side effect and no coupling to the
 * removed keymap/selection-snap machinery.
 *
 * `StrongEmphasis` always parses with exactly two `EmphasisMark` children (the
 * opening/closing `**` or `__` run) and nothing else of its own — inline text
 * between them isn't itself a node — so `firstChild`/`lastChild` reliably
 * identify the delimiters (same shape `emphasisMarkerDecoration.ts` relies on).
 *
 * Ranges are collected into an array and sorted once via `Decoration.set(_,
 * true)` rather than inserted in tree-visitation order via `RangeSetBuilder`
 * — confirmed necessary, not merely defensive: a delimiter run of 4+ stars
 * (`****text****`) parses as `StrongEmphasis` nested inside `StrongEmphasis`
 * (a genuine, valid CommonMark shape, not malformed input), visited
 * outer-first by `iterate`. The outer node's own ranges (its two
 * `EmphasisMark`s plus the `Decoration.mark` spanning its entire content,
 * which — for the nested case — is the inner node's whole span) are added
 * before descending into the inner node, whose own earlier-positioned
 * ranges then arrive out of order. `RangeSetBuilder.add` requires strictly
 * non-decreasing `from` positions and throws otherwise; that throw is
 * uncaught here and propagates into `EditorView`'s own plugin-crash
 * handling, which permanently disables this whole extension for the
 * view's remaining lifetime — confirmed by direct execution, not assumed.
 * `Decoration.set(ranges, true)` has no such ordering requirement (it
 * sorts internally) and correctly tolerates the resulting overlap between
 * the outer's content `Decoration.mark` and the inner's own ranges —
 * ordinary, supported overlap between a mark and nested replace ranges,
 * the same shape `liveMarkDecoration.ts` already relies on for its own
 * nested-construct case (`***bold italic***`).
 *
 * Engagement is checked against the node's inner content range
 * (`openMark.to` to `closeMark.from`), not its full range (`node.from` to
 * `node.to`) — confirmed necessary, not cosmetic. `isTokenEngaged`'s
 * containment check is boundary-inclusive by design (shared with the
 * semantic-token family), so checking the full range means a caret
 * sitting exactly at `node.from`/`node.to` counts as "inside." That's
 * unreachable in an ordinary document (something else is always beyond
 * the construct), but `createEditorView.ts` always seeds the initial
 * selection at `doc.length`, so any document whose content is (or ends
 * with) exactly a `StrongEmphasis` puts the caret exactly on that
 * boundary on load — confirmed by direct execution to leave the markers
 * stuck visibly unconcealed until the user clicks elsewhere. Checking the
 * inner content range instead means only a caret genuinely between the
 * delimiters engages; a caret immediately before/after them does not.
 * This doesn't regress reveal-while-editing: while composing `**word**`,
 * the moment the closing delimiter is completed the caret sits at
 * `node.to`, now outside the content range, so the construct immediately
 * collapses to its bold rendered form — the same behavior every
 * real-world live-preview Markdown editor exhibits, not a new gap.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'StrongEmphasis') {
          return;
        }

        const openMark = node.node.firstChild;
        const closeMark = node.node.lastChild;
        if (!openMark || openMark.name !== 'EmphasisMark' || !closeMark || closeMark.name !== 'EmphasisMark') {
          return;
        }

        if (isTokenEngaged(view.state, { from: openMark.to, to: closeMark.from })) {
          return;
        }

        ranges.push(Decoration.replace({}).range(openMark.from, openMark.to));
        if (openMark.to < closeMark.from) {
          ranges.push(Decoration.mark({ class: 'tok-strong' }).range(openMark.to, closeMark.from));
        }
        ranges.push(Decoration.replace({}).range(closeMark.from, closeMark.to));
      },
    });
  }

  return Decoration.set(ranges, true);
}

interface BoldLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function boldLivePreview(): Extension {
  return ViewPlugin.fromClass<BoldLivePreviewPlugin>(
    class implements BoldLivePreviewPlugin {
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
