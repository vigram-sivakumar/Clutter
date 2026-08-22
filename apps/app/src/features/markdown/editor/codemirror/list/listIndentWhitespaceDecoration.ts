import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { findTaskMarker, markerRange } from '../highlight/listMarkerDecoration';

/**
 * Visually collapses two kinds of raw Markdown whitespace around a list
 * marker while it's rendered (not revealed), without touching the
 * document — both stay exactly as typed in `state.doc`; this is
 * rendering-only:
 *
 *  - the raw leading indentation *before* a nested marker
 *    (`ListMark`), additive on top of `.cm-list-line`'s own `padding-left`
 *    (`listLineDecoration.ts`/`MarkdownEditor.css`);
 *  - the raw separator space *after* a marker — the CommonMark-required
 *    delimiter between `-`/`1.`/`[ ]` and the item's content — which
 *    otherwise renders as ordinary text adding its own width on top of the
 *    marker-box-only hanging indent.
 *
 * Neither belongs to any syntax node of its own, so both render as
 * ordinary proportional-font text unless something collapses them.
 *
 * Tracks the exact same range `listMarkerDecoration.ts`'s own render-vs-
 * reveal decision uses (`markerRange`) — imported directly, not a second,
 * independently-computed notion of "is this marker rendered or revealed."
 * Whitespace immediately around a marker has no reason to reveal
 * independently of that marker.
 */
function selectionWithin(view: EditorView, range: { from: number; to: number }): boolean {
  const selection = view.state.selection.main;
  return selection.from >= range.from && selection.to <= range.to;
}

/**
 * The whitespace strictly between `node`'s own end and wherever its
 * content actually starts — `node.nextSibling`'s own start position, the
 * same tree-derived "content column" `listIndentKeymap.ts`'s
 * `contentColumn()` already relies on, rather than a fixed one-character
 * offset: a separator isn't always exactly one space, and anchoring to the
 * real next sibling handles any width by construction. Falls back to one
 * column past `node`'s own end (bounded by the document's length) only
 * when there's no next sibling at all — an empty item with nothing typed
 * after its marker yet.
 */
function separatorRangeAfter(
  docLength: number,
  sliceDoc: (from: number, to: number) => string,
  node: SyntaxNode
): { from: number; to: number } | null {
  const from = node.to;
  const to = node.nextSibling ? node.nextSibling.from : Math.min(from + 1, docLength);

  if (to <= from) {
    return null;
  }

  const gapText = sliceDoc(from, to);
  if (gapText.trim() !== '') {
    return null;
  }

  return { from, to };
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const collapse = Decoration.replace({});
  const ranges: { from: number; to: number }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'ListItem') {
          return;
        }

        const marker = markerRange(node.node);
        if (!marker || selectionWithin(view, marker)) {
          return;
        }

        // Leading indentation: [line.from, marker.from). Only collapsed
        // once proven whitespace-only — a marker nested inside another
        // construct that itself occupies the start of the line (a list
        // inside a blockquote, `> - item`) must never have that unrelated
        // construct's own prefix swallowed along with the intended
        // indentation.
        const line = view.state.doc.lineAt(marker.from);
        if (marker.from > line.from) {
          const leadingText = view.state.sliceDoc(line.from, marker.from);
          if (leadingText.trim() === '') {
            ranges.push({ from: line.from, to: marker.from });
          }
        }

        // Separator: anchored to whichever node the reader sees as "the
        // marker" at rest. For a task, that's the checkbox (`TaskMarker`)
        // — the separator that matters is the one after it, not after the
        // dash that's already folded into the same rendered unit.
        const anchorNode = findTaskMarker(node.node) ?? node.node.firstChild;
        if (anchorNode) {
          const separator = separatorRangeAfter(
            view.state.doc.length,
            (f, t) => view.state.sliceDoc(f, t),
            anchorNode
          );
          if (separator) {
            ranges.push(separator);
          }
        }
      },
    });
  }

  ranges.sort((a, b) => a.from - b.from);
  for (const range of ranges) {
    builder.add(range.from, range.to, collapse);
  }

  return builder.finish();
}

interface ListIndentWhitespacePlugin extends PluginValue {
  decorations: DecorationSet;
}

export function listIndentWhitespaceDecoration(): Extension {
  return ViewPlugin.fromClass<ListIndentWhitespacePlugin>(
    class implements ListIndentWhitespacePlugin {
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
