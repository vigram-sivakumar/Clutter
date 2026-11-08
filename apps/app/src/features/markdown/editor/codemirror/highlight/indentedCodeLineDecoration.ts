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
 * Marks every physical line of an indented code block (`CodeBlock`: 4+ leading columns at the start of a block,
 * CommonMark) with `cm-indented-code-line`, so `MarkdownEditor.css` can set it in the monospace font. Presentation
 * only, and deliberately nothing like a fenced block's card: no background, language label or copy button, since
 * an indented block has no fence to hang those on. The text stays in `state.doc` untouched.
 */
const INDENTED_CODE_LINE = Decoration.line({ class: 'cm-indented-code-line' });

function buildIndentedCodeLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let lastLineFrom = -1;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'CodeBlock') {
          return;
        }
        const first = view.state.doc.lineAt(node.from).number;
        const last = view.state.doc.lineAt(node.to).number;
        for (let number = first; number <= last; number++) {
          const line = view.state.doc.line(number);
          if (line.from > lastLineFrom) {
            builder.add(line.from, line.from, INDENTED_CODE_LINE);
            lastLineFrom = line.from;
          }
        }
      },
    });
  }

  return builder.finish();
}

interface IndentedCodeLinePlugin extends PluginValue {
  decorations: DecorationSet;
}

export function indentedCodeLineDecoration(): Extension {
  return ViewPlugin.fromClass<IndentedCodeLinePlugin>(
    class implements IndentedCodeLinePlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildIndentedCodeLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildIndentedCodeLineDecorations(update.view);
        }
      }
    },
    { decorations: (p) => p.decorations }
  );
}
