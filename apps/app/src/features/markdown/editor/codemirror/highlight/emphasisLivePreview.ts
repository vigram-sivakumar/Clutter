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
 * Emphasis-family Live Preview: merges what were previously
 * `boldLivePreview.ts` (`StrongEmphasis`) and `italicLivePreview.ts`
 * (`Emphasis`) into a single plugin with a single tree traversal, per
 * docs/editor-architecture-decisions.md's "Live-preview rendering
 * architecture" section — bold and italic are separate styles but one
 * emphasis system, and nested/combined constructs (`***bold italic***`,
 * `**_bold italic_**`, same-kind chains like `****text****`) need one
 * shared engagement decision, not two independently-engaged plugins that
 * happen to overlap.
 *
 * `Emphasis` and `StrongEmphasis` both always parse with exactly two
 * `EmphasisMark` children (the opening/closing delimiter run) and nothing
 * else of their own — `firstChild`/`lastChild` reliably identify the
 * delimiters, for either node kind.
 *
 * Nesting — same-kind (a 4+-star run, `StrongEmphasis` inside
 * `StrongEmphasis`) or mixed-kind (`***text***`, `**_text_**`,
 * `_*text*_`) — always produces the inner node as the *sole* non-mark
 * child of the outer, with zero character gap between the outer node's
 * own marks and the inner node's range (confirmed via direct tree
 * inspection across all delimiter combinations, not assumed). That's what
 * makes traversal-order engagement sufficient on its own: when the outer
 * node is engaged, this callback returns `false`, which stops `iterate`
 * from descending into the inner node at all — the inner node is never
 * independently visited, so it can never independently (and wrongly)
 * disagree about whether the construct is revealed. When the outer node
 * is *not* engaged, the inner node's own range is always a subset of the
 * outer's (same zero-gap fact), so the inner node's own engagement check
 * is guaranteed to also come out disengaged when reached — no shared
 * "combined region" range needs to be computed anywhere; the correct
 * atomic behavior falls entirely out of visiting outer-before-inner and
 * only conditionally descending.
 *
 * Ranges are collected into an array and sorted once via `Decoration.set(_,
 * true)` rather than inserted in tree-visitation order via
 * `RangeSetBuilder` — carried over from both predecessor files: a nested
 * construct's outer content `Decoration.mark` (spanning the inner node's
 * entire range) is pushed before the inner node's own, earlier-positioned
 * ranges, which `RangeSetBuilder.add`'s strictly-non-decreasing-`from`
 * requirement can't tolerate but `Decoration.set(ranges, true)` handles
 * correctly (it sorts internally and tolerates the resulting overlap —
 * the same overlap `liveMarkDecoration.ts` already relies on for
 * `***bold italic***`).
 *
 * Engagement is checked against each visited node's own full range
 * (`node.from` to `node.to`), including both boundaries — a caret sitting
 * exactly at `node.from` or `node.to` counts as engaged. See
 * `boldLivePreview.ts`'s original doc comment (retired alongside this
 * file) for why full-range containment was chosen over the inner-content
 * range: the narrower rule broke the "stays revealed on the exact
 * keystroke that completes the construct" case, which is far more common
 * than the mount-time whole-document-construct edge case the narrower
 * rule was trying to fix. That edge case remains a known, deliberately
 * deferred limitation (see this file's test suite), unrelated to nesting.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Emphasis' && node.name !== 'StrongEmphasis') {
          return;
        }

        const openMark = node.node.firstChild;
        const closeMark = node.node.lastChild;
        if (!openMark || openMark.name !== 'EmphasisMark' || !closeMark || closeMark.name !== 'EmphasisMark') {
          return;
        }

        if (isTokenEngaged(view.state, { from: node.from, to: node.to })) {
          return false;
        }

        const cls = node.name === 'StrongEmphasis' ? 'tok-strong' : 'tok-emphasis';
        ranges.push(Decoration.replace({}).range(openMark.from, openMark.to));
        if (openMark.to < closeMark.from) {
          ranges.push(Decoration.mark({ class: cls }).range(openMark.to, closeMark.from));
        }
        ranges.push(Decoration.replace({}).range(closeMark.from, closeMark.to));
      },
    });
  }

  return Decoration.set(ranges, true);
}

interface EmphasisLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function emphasisLivePreview(): Extension {
  return ViewPlugin.fromClass<EmphasisLivePreviewPlugin>(
    class implements EmphasisLivePreviewPlugin {
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
