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
import type { Range } from '@codemirror/state';

import { BlockquoteLevelWidget } from './BlockquoteLevelWidget';
import { blockquoteDepth, isBlockquoteOwned } from './blockquoteLineDecoration';

/**
 * One independent, independently-styleable DOM element per blockquote
 * nesting level — the "positional Option A" resolved with the user
 * (2026-08-26): each level's rail widget is anchored at that level's own
 * real `QuoteMark.from` with `side: -1`, so it visually sits immediately
 * before its corresponding `>` character, without ever rendering that
 * character itself. `blockquoteMarkerDecoration.ts` (reveal/conceal of the
 * real `>` text) is untouched by this file and this file never reads its
 * state — the widget's own existence and position come only from the
 * `QuoteMark` node's `.from`, a static document fact true whether or not
 * that character currently happens to be visible.
 *
 * This deliberately replaces the earlier single-`::before`-with-a-
 * repeating-gradient approach (still visible in git history): that
 * approach could only ever paint one shared background, so no individual
 * bar could get its own `border-radius` or its own future per-level
 * styling. A real element per level removes that ceiling — see
 * `BlockquoteLevelWidget.ts` and `MarkdownEditor.css`'s `.cm-quote-level`
 * rules.
 *
 * Anchoring, level by level:
 * - Walk this physical line's own portion of the tree (`syntaxTree(...).
 *   iterate({ from: line.from, to: line.to })`) collecting every
 *   `QuoteMark` node's `.from`, in left-to-right document order. CommonMark
 *   always matches a line's own `>` markers outer-to-inner, left-to-right,
 *   so this order already *is* level 1, 2, 3, … — no separate ancestor
 *   walk needed per marker, unlike `blockquoteDepth` itself.
 * - `blockquoteDepth` (via the exported `blockquoteLineDecoration.ts`
 *   helper — one shared tree read, not two) gives the line's real total
 *   depth, which can exceed this line's own marker count: a lazy-
 *   continuation line can carry fewer `>` than the blockquote it's
 *   actually nested in (CommonMark absorbs the missing ones into the
 *   deepest open `Blockquote`'s `Paragraph` — confirmed directly against
 *   the installed parser, see `blockquoteLineDecoration.ts`'s own
 *   `blockquoteDepth` comment). Those deeper, marker-less levels are
 *   always the *last* ones (CommonMark never leaves a gap in the middle —
 *   matching happens strictly outer-to-inner), so any level beyond this
 *   line's own marker count anchors at the position right after the last
 *   real marker this line does have (or `line.from` if it has none at
 *   all) — a bounded, documented gap, not a heuristic: there is genuinely
 *   no character on this physical line to anchor a deeper level to.
 * - Horizontal placement of the rail itself never depends on this anchor
 *   position — `MarkdownEditor.css` positions each rail via its own
 *   `--quote-level` custom property, absolutely, against the enclosing
 *   `.cm-quote-line`. The anchor position only controls where in the
 *   *document* flow (hence DOM order, hence caret/hit-testing behavior)
 *   the zero-width widget itself sits — matters for interaction, not for
 *   where the bar paints.
 */
function collectLineQuoteMarkFroms(view: EditorView, line: { from: number; to: number }): number[] {
  const froms: number[] = [];
  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter: (node) => {
      if (node.name === 'QuoteMark') {
        froms.push(node.from);
      }
    },
  });
  return froms;
}

function buildLineLevelRanges(view: EditorView, line: { from: number; to: number; text: string }): Range<Decoration>[] {
  const depth = blockquoteDepth(view.state, line.to);
  if (depth === 0) {
    return [];
  }

  const markerFroms = collectLineQuoteMarkFroms(view, line);
  const lastMarkerFrom = markerFroms[markerFroms.length - 1];
  const fallbackPos = lastMarkerFrom ?? line.from;

  const ranges: Range<Decoration>[] = [];
  for (let level = 1; level <= depth; level++) {
    const markerFrom = markerFroms[level - 1];
    const anchor = markerFrom ?? fallbackPos;
    ranges.push(
      Decoration.widget({ widget: new BlockquoteLevelWidget(level), side: -1 }).range(anchor)
    );
  }
  return ranges;
}

function buildBlockquoteLevelDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);

        if (isBlockquoteOwned(view.state, line)) {
          ranges.push(...buildLineLevelRanges(view, line));
        }
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

interface BlockquoteLevelPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function blockquoteLevelDecoration(): Extension {
  return ViewPlugin.fromClass<BlockquoteLevelPlugin>(
    class implements BlockquoteLevelPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildBlockquoteLevelDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildBlockquoteLevelDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
