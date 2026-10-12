import { foldedRanges, unfoldEffect } from '@codemirror/language';
import type { StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Unfolds exactly the folded sections that hide the lines holding `positions`, so a navigation target can be
 * scrolled to and highlighted: a folded range is replaced by a widget, so a line inside it has no coordinates
 * and its highlight decoration never reaches the DOM. A fold that does not contain any of the lines — and a
 * position on a heading's own line, which stays visible when its section is folded — is left alone.
 *
 * Folding is the editor's own (`foldState`, the same ranges the fold toggles and `FoldStateStore` use); an
 * embedded note's whole-card collapse is a separate mechanism that never reaches this view's fold state.
 */
export function unfoldToReveal(view: EditorView, positions: readonly number[]): void {
  const folded = foldedRanges(view.state);
  const effects = new Map<string, StateEffect<{ from: number; to: number }>>();

  for (const position of positions) {
    const lineStart = view.state.doc.lineAt(position).from;

    folded.between(lineStart, lineStart, (from, to) => {
      if (from <= lineStart && lineStart <= to) {
        effects.set(`${from}:${to}`, unfoldEffect.of({ from, to }));
      }
    });
  }

  if (effects.size > 0) {
    view.dispatch({ effects: [...effects.values()] });
  }
}
