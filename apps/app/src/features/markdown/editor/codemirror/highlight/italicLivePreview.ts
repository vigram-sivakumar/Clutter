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
 * Italic-only Live Preview vertical slice, built directly on the proven
 * `boldLivePreview.ts` architecture — same shape, `Emphasis` instead of
 * `StrongEmphasis`, `tok-emphasis` instead of `tok-strong`. See
 * `boldLivePreview.ts`'s own doc comment for the full rationale (why
 * `liveMarkDecoration.ts` isn't reused, why `isTokenEngaged` is reused
 * as-is, why `Decoration.set(_, true)` rather than `RangeSetBuilder`, why
 * engagement is checked against the full node range rather than the inner
 * content range, including why that was tried and reverted) — all of it
 * applies unchanged here.
 *
 * `Emphasis` always parses with exactly two `EmphasisMark` children (the
 * opening/closing single `*` or `_`) and nothing else of its own, the
 * same shape `StrongEmphasis` has — `firstChild`/`lastChild` reliably
 * identify the delimiters.
 *
 * Same-type nesting exists for `Emphasis` too, via a different trigger
 * than `StrongEmphasis`'s 4-star run: **mixed delimiter characters**
 * (`_*a*_`, `*_a_*`) produce genuine `Emphasis` nested inside `Emphasis`
 * (confirmed via direct tree inspection: `Emphasis[0,5] > [EmphasisMark,
 * Emphasis[1,4], EmphasisMark]`) — the identical shape of problem
 * `RangeSetBuilder` already crashed on for bold, fixed here from the
 * start via the same `Decoration.set(ranges, true)` collection pattern.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Emphasis') {
          return;
        }

        const openMark = node.node.firstChild;
        const closeMark = node.node.lastChild;
        if (!openMark || openMark.name !== 'EmphasisMark' || !closeMark || closeMark.name !== 'EmphasisMark') {
          return;
        }

        if (isTokenEngaged(view.state, { from: node.from, to: node.to })) {
          return;
        }

        ranges.push(Decoration.replace({}).range(openMark.from, openMark.to));
        if (openMark.to < closeMark.from) {
          ranges.push(Decoration.mark({ class: 'tok-emphasis' }).range(openMark.to, closeMark.from));
        }
        ranges.push(Decoration.replace({}).range(closeMark.from, closeMark.to));
      },
    });
  }

  return Decoration.set(ranges, true);
}

interface ItalicLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function italicLivePreview(): Extension {
  return ViewPlugin.fromClass<ItalicLivePreviewPlugin>(
    class implements ItalicLivePreviewPlugin {
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
