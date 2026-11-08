import { isolateHistory } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { readPreferClutterQuoteSyntax } from '@shared/helpers/preferClutterQuoteSyntaxPreference';

/**
 * Typed-input rules for Clutter's native quote marker (`" `, see `clutterQuoteSyntax.ts`), installed just before
 * `closeBrackets()`. Both are input handlers, so they only ever see characters the user types: pasted text, drops and
 * programmatic edits never reach them.
 *
 * 1. A typed `"` with nothing selected inserts exactly one character, not the `""` pair `closeBrackets()` would make.
 *    It declines (returns false) in every other case, which sends a typed `"` over a selection to `closeBrackets()`
 *    itself, unchanged: selecting `Orange` and typing `"` still wraps it as `"Orange"`, and every other bracket and
 *    quote character keeps its auto-closing. Input handlers run in order and the first to return true wins, hence
 *    "before `closeBrackets()`".
 * 2. With the *Prefer Clutter quote syntax* setting on, the space that completes a `>` quote marker turns it into `" `.
 *    See `startedQuoteMarkerBefore` for exactly when.
 *
 * Several cursors are handled together for (1); composition (IME) input is never touched by either.
 */
export function singleQuoteMarkerInput(): Extension {
  return [typedQuoteMark, preferredQuoteSyntax];
}

const typedQuoteMark = EditorView.inputHandler.of((view, from, to, text) => {
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

/**
 * Where the `>` that the cursor at `pos` has just been typed after starts, or -1 when typing a space there is not
 * completing a new quote marker. All of these must hold, so nothing already written is ever converted:
 * - the character before the cursor is the parse tree's own `QuoteMark` (never a `>` in code, a link, or mid-text),
 * - that mark opens its quote (`Blockquote` starts at the mark); a marker continuing an existing quote is left alone,
 * - nothing but the end of the line or a non-space follows the cursor: a `>` that already has its space is an existing
 *   marker, and a second space after it is just a space.
 */
function startedQuoteMarkerBefore(state: EditorState, pos: number): number {
  if (pos < 1 || state.sliceDoc(pos - 1, pos) !== '>') {
    return -1;
  }
  const next = state.sliceDoc(pos, pos + 1);
  if (next === ' ' || next === '\t') {
    return -1;
  }
  const mark = syntaxTree(state).resolveInner(pos, -1);
  const quote = mark.parent;
  if (mark.name !== 'QuoteMark' || mark.from !== pos - 1 || mark.to !== pos || quote?.name !== 'Blockquote' || quote.from !== mark.from) {
    return -1;
  }
  return mark.from;
}

const preferredQuoteSyntax = EditorView.inputHandler.of((view, from, to, text, insert) => {
  if (text !== ' ' || view.composing || view.compositionStarted || view.state.readOnly || !readPreferClutterQuoteSyntax()) {
    return false;
  }
  const { selection } = view.state;
  if (selection.ranges.length !== 1 || !selection.main.empty || from !== selection.main.head || to !== from) {
    return false;
  }
  const markFrom = startedQuoteMarkerBefore(view.state, from);
  if (markFrom < 0) {
    return false;
  }

  // The space goes in exactly as typed, so undo has `> ` to come back to; the swap is its own history step on top.
  view.dispatch(insert());
  view.dispatch({
    changes: { from: markFrom, to: markFrom + 1, insert: '"' },
    selection: EditorSelection.cursor(from + 1),
    userEvent: 'input',
    annotations: isolateHistory.of('full'),
  });
  return true;
});
