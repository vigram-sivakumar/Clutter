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
 * Generic leading-whitespace representation — independent of, and
 * composable with, every Markdown-construct decoration in this codebase
 * (blockquote, list, code). For every physical line, wraps each of its
 * leading whitespace characters (spaces and tabs alike, however many
 * there are, in whatever mix) in its own `Decoration.mark({ class:
 * 'cm-indent' })`. Deliberately no other logic:
 *
 * - No syntax-tree lookup, no construct/ancestor check — the Markdown
 *   construct a line belongs to never determines whether its leading
 *   whitespace gets wrapped. That composition (how this looks next to a
 *   blockquote bar, a list's own indent, code content, etc.) is a later,
 *   separate decision.
 * - `Decoration.mark`, not `Decoration.replace` — the real whitespace
 *   character stays in the rendered DOM, at its own native width. Only a
 *   class is added; nothing is replaced, hidden, or measured.
 * - One mark per raw character, never grouped by `indentUnit` or any
 *   other notion of an "indent step" — `indentUnit` governs what Tab
 *   happens to insert, a keyboard-command concern this layer has no
 *   knowledge of and no dependency on.
 * - `state.doc` is never touched.
 *
 * Rebuilt purely from `state.doc` on every `docChanged`/`viewportChanged`,
 * the same trigger every other decoration in this file family uses.
 * Because the count of marks is a pure function of how many leading
 * whitespace characters currently exist — never of which edit produced
 * them — identical resulting text always renders identically, regardless
 * of whether it arrived via Tab, Shift-Tab, typing, paste, Enter
 * inheriting indentation, or Backspace/Delete leaving a partial run.
 */
const INDENT_MARK = Decoration.mark({ class: 'cm-indent' });

function leadingWhitespaceLength(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const leadingLength = leadingWhitespaceLength(line.text);

      for (let i = 0; i < leadingLength; i++) {
        builder.add(line.from + i, line.from + i + 1, INDENT_MARK);
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

interface LeadingIndentPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function leadingIndentDecoration(): Extension {
  return ViewPlugin.fromClass<LeadingIndentPlugin>(
    class implements LeadingIndentPlugin {
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
