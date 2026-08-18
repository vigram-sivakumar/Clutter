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

/**
 * Covers the one gap `markdownHighlightStyle.ts` cannot reach:
 * `syntaxHighlighting()`/`HighlightStyle` can only ever style exactly the
 * ranges the Lezer tree already reports — it has no mechanism to extend a
 * tag's coverage by additional characters. `HeaderMark` (`# `/`## `/etc.)
 * covers only the hash run itself; the single CommonMark-required
 * separator space after it belongs to no node at all — confirmed directly
 * against `@lezer/markdown`'s own `ATXHeading` block parser
 * (`dist/index.js`): inline content parsing explicitly starts at
 * `off + size + 1`, one character past the hash run, with that one
 * character written into neither `HeaderMark` nor the inline content
 * buffer. Hiding the marker without also hiding that character is what
 * previously left a one-space gap before the heading text when inactive.
 *
 * This still reuses the same Lezer tree `markdownHighlightStyle.ts` reads
 * — no second parser, no regex scan of the document. The only
 * document-content read is a single-character bounds check
 * (`sliceDoc(separatorFrom, separatorTo) === ' '`) immediately after a
 * `HeaderMark` node, to confirm a real separator character is actually
 * there before claiming it — never assumed from the node structure alone.
 * This matters for an ATX heading with no title at all (a bare `#` at
 * end of line is valid CommonMark and has nothing after the hash run to
 * hide) — extending the range unconditionally would claim a character
 * that may not exist.
 *
 * Applies the *same* `tok-headingN tok-mark` classes
 * `markdownHighlightStyle.ts` already produces for `HeaderMark` itself —
 * so the existing hide-when-inactive/color-when-active CSS rules
 * (`MarkdownEditor.css`) apply to this range automatically, with no new
 * CSS. Purely a `Decoration.mark()` (a class on already-existing text) —
 * never `Decoration.replace()` — so the document itself is never touched;
 * this is presentation only, same guarantee every decoration in this
 * codebase already provides.
 */
const HEADING_NODE_LEVEL: Readonly<Record<string, number>> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const level = HEADING_NODE_LEVEL[node.name];
        if (!level) {
          return;
        }

        const headerMark = node.node.firstChild;
        if (!headerMark || headerMark.name !== 'HeaderMark') {
          return;
        }

        const separatorFrom = headerMark.to;
        const separatorTo = separatorFrom + 1;
        if (separatorTo > view.state.doc.length) {
          return;
        }
        if (view.state.sliceDoc(separatorFrom, separatorTo) !== ' ') {
          return;
        }

        builder.add(
          separatorFrom,
          separatorTo,
          Decoration.mark({ class: `tok-heading${level} tok-mark` })
        );
      },
    });
  }

  return builder.finish();
}

interface HeadingSeparatorPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function headingSeparatorDecoration(): Extension {
  return ViewPlugin.fromClass<HeadingSeparatorPlugin>(
    class implements HeadingSeparatorPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
