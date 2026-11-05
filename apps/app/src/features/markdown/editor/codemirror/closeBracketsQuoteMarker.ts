import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * `"` is Clutter's native quote marker (`" ` opens a quote, see `clutterQuoteSyntax.ts`), so typing one must leave
 * exactly one — not the `""` pair `closeBrackets()` would make, which the user would have to delete by hand.
 *
 * An extension of the existing `closeBrackets()` setup, not a replacement: this input handler only claims a
 * typed `"` when *no* text is selected, and declines (returns false) in every other case. That sends a typed `"`
 * over a selection to `closeBrackets()` itself, unchanged, so selecting `Orange` and typing `"` still wraps it as
 * `"Orange"`, and every other bracket and quote character (`(`, `[`, `{`, `'`) keeps its auto-closing exactly as
 * before. It must be installed *before* `closeBrackets()` in the extension list: input handlers run in order and the
 * first to return true wins.
 *
 * Several cursors are handled together (a `"` at each); composition (IME) input is never touched.
 */
export function singleQuoteMarkerInput(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '"' || view.composing || view.compositionStarted || view.state.readOnly) {
      return false;
    }
    const { selection } = view.state;
    const main = selection.main;
    if (from !== main.from || to !== main.to || selection.ranges.some((range) => !range.empty)) {
      return false;
    }
    view.dispatch(view.state.update(view.state.replaceSelection('"'), { scrollIntoView: true, userEvent: 'input.type' }));
    return true;
  });
}
