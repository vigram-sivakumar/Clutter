import type { Extension, Range } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';

import './collapsedQuoteExitDecoration.css';
import { collapsedQuoteExitLineNumbers } from './separatorScope';

/**
 * Collapses the structural blank line Enter leaves when it exits a blockquote
 * (`> Text⏎⏎|`), so the quote and the next paragraph read as one flow while the
 * document keeps the blank line Markdown needs to end the quote.
 *
 * Presentation only: a `Decoration.line` class, no document change, no
 * transaction, no keymap, not atomic, no widget. Which lines qualify is owned
 * by `isCollapsedQuoteExitLine` in `separatorScope.ts`; the same line numbers
 * are skipped by `blockSeparatorDecoration.ts`'s boundary walk, which is how the
 * spacing is resolved between the quote and the line after the blank one. A
 * `ViewPlugin` is enough (line decorations don't need a `StateField`), the same
 * shape as `table/tableColumnWidthsConcealment.ts`.
 */
const collapsedLineDecoration = Decoration.line({ class: 'cm-collapsed-quote-exit' });

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  for (const lineNumber of collapsedQuoteExitLineNumbers(state)) {
    ranges.push(collapsedLineDecoration.range(state.doc.line(lineNumber).from));
  }
  return Decoration.set(ranges, true);
}

interface CollapsedQuoteExitPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function collapsedQuoteExitDecoration(): Extension {
  return ViewPlugin.fromClass<CollapsedQuoteExitPlugin>(
    class implements CollapsedQuoteExitPlugin {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}
