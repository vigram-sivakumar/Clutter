import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
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
 * Live Preview marker hiding for emphasis, at node granularity — unlike
 * the heading slice (MarkdownEditor.css), which accepts line granularity
 * via `.cm-activeLine` for now, this reuses the exact selection-containment
 * engagement query `wikiLinkMarkerDecorations.ts` already established
 * (`isTokenEngaged`, `semanticToken/tokenEngagement.ts` — "extracted once
 * this part proved kind-agnostic", docs/editor-architecture-decisions.md
 * §11) because a single line can hold more than one emphasis span and only
 * the one the cursor is actually in/adjacent to should reveal its markers.
 *
 * Structurally the opposite of `wikiLinkMarkerDecorations.ts`: WikiLink
 * replaces its whole node with a widget at rest, so marks there exist in
 * the DOM only when engaged (nothing to hide). Emphasis text is never
 * replaced — `markdownHighlightStyle.ts` already renders `Emphasis`/
 * `StrongEmphasis` text and their `EmphasisMark` children every time via
 * `tok-emphasis`/`tok-strong`/`tok-mark` — so this instead adds a
 * `tok-mark-hidden` class over the two `EmphasisMark` children whenever
 * the enclosing construct is *not* engaged, the inverse direction. CM6
 * merges decorations from multiple extensions that cover the same range
 * into one class list on the same span, so this composes with
 * `markdownHighlightStyle.ts`'s own classes rather than replacing them —
 * same mechanism `wikiLinkMarkerDecorations.ts` already relies on for its
 * `tok-mark tok-wikilink-mark` pair.
 *
 * `Emphasis`/`StrongEmphasis` always parse with exactly two `EmphasisMark`
 * children — the opening and closing delimiter run — and nothing else of
 * their own (confirmed empirically against the installed
 * `@lezer/markdown`: inline text between them isn't itself a node), so
 * `firstChild`/`lastChild` reliably identify them, the same
 * two-endpoints-only shape `headingSeparatorDecoration.ts` and
 * `wikiLinkMarkerDecorations.ts` both already lean on. `***bold italic***`
 * nests a `StrongEmphasis` inside an `Emphasis` (or vice versa for
 * underscores) — each has its own range and is engaged/hidden
 * independently, so a cursor inside the inner text engages both and
 * reveals both delimiter pairs together; a cursor beyond one boundary but
 * still within the other reveals only the relevant pair.
 */
const isEmphasisNode = (nodeName: string): boolean =>
  nodeName === 'Emphasis' || nodeName === 'StrongEmphasis';

const hiddenMark = Decoration.mark({ class: 'tok-mark-hidden' });

/**
 * Collected and sorted via `Decoration.set(_, true)` rather than a
 * `RangeSetBuilder` (the pattern `wikiLinkMarkerDecorations.ts` and
 * `headingSeparatorDecoration.ts` both use): a nested `***bold italic***`
 * visits its outer node's close mark *before* descending into the inner
 * node's own marks, which sit earlier in the document — `RangeSetBuilder`
 * requires strictly ascending insertion and throws otherwise, so the
 * ranges have to be gathered first and sorted once, not added in tree
 * visitation order.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Array<{ from: number; to: number }> = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isEmphasisNode(node.name)) {
          return;
        }

        const range = { from: node.from, to: node.to };
        if (isTokenEngaged(view.state, range)) {
          return;
        }

        const openMark = node.node.firstChild;
        const closeMark = node.node.lastChild;
        if (!openMark || openMark.name !== 'EmphasisMark') {
          return;
        }
        if (!closeMark || closeMark.name !== 'EmphasisMark') {
          return;
        }

        ranges.push({ from: openMark.from, to: openMark.to });
        ranges.push({ from: closeMark.from, to: closeMark.to });
      },
    });
  }

  return Decoration.set(
    ranges.map(({ from, to }) => hiddenMark.range(from, to)),
    true
  );
}

interface EmphasisMarkerPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * Purely visual: hides an at-rest emphasis construct's two `EmphasisMark`
 * delimiters via a `tok-mark-hidden` class (`MarkdownEditor.css`), so a
 * cursor moved into (or to the boundary of) the construct reveals them
 * again through the normal engagement recompute below — no atomic ranges,
 * no interaction handling, no document mutation.
 */
export function emphasisMarkerDecoration(): Extension {
  return ViewPlugin.fromClass<EmphasisMarkerPlugin>(
    class implements EmphasisMarkerPlugin {
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
