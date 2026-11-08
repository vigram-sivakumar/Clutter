import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/** Constructs whose text is not Markdown prose: a `[]` typed inside one is just those characters. */
const LITERAL_BLOCKS: ReadonlySet<string> = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock', 'CommentBlock', 'InlineCode']);

/** Everything before the cursor is indentation and a bare `[]`. */
const BARE_BRACKETS = /^([ \t]*)\[\]$/;

/** What `[]` plus Space becomes: an unchecked task, ready for its text. */
export const TASK_MARKER = '- [ ] ';

/**
 * The `Space` keybinding that turns a bare `[]` at the start of a line into an unchecked task (`[]` → `- [ ] `), so
 * a task is started without typing the whole `- [ ] ` marker. The line may be empty or already hold text, which the
 * task keeps: typing `[]` and Space in front of `Buy groceries` makes `- [ ] Buy groceries`. The marker-creation
 * counterpart of `orderedListMarkerCreation.ts` (same keymap entry, `markdownEnterKeymap()`'s `Space`: that command
 * runs first and declines for anything that is not a bare ordered marker, then this one).
 *
 * Deliberately narrow, and a no-op (returns false, so the Space is typed as usual) for everything else:
 * - the `[]` must be the start of the line, after indentation only, with the cursor right after it.
 *   `see []`, `- []` (a bullet's own text) and `> []` (a quote's) are ordinary text;
 * - not inside fenced code, a code block, inline code, HTML or a comment;
 * - a single, empty selection.
 *
 * The typed Space is the marker's own separator, so the edit replaces the two brackets (and any spaces right after
 * them) with `- [ ] ` and the cursor lands after it; the rest of the line is untouched. The result is a normal task:
 * the parser makes it a `Task` with a `TaskMarker`, so rendering, the checkbox, and Enter / Backspace behave exactly
 * as for a task typed by hand. Indentation is kept as typed. One transaction, so one undo restores the `[]`.
 */
/** True when `pos` is inside a construct whose text is not Markdown prose (see `LITERAL_BLOCKS`). */
function insideLiteralBlock(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (LITERAL_BLOCKS.has(node.name)) {
      return true;
    }
  }
  return false;
}

export const insertTaskMarkerOnSpace: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);

  const match = BARE_BRACKETS.exec(state.sliceDoc(line.from, pos));
  if (!match) {
    return false;
  }

  if (insideLiteralBlock(state, pos)) {
    return false;
  }

  const markerFrom = line.from + match[1]!.length;
  const spacesAfter = /^[ \t]*/.exec(state.sliceDoc(pos, line.to))![0].length;
  dispatch(
    state.update({
      changes: { from: markerFrom, to: pos + spacesAfter, insert: TASK_MARKER },
      selection: EditorSelection.cursor(markerFrom + TASK_MARKER.length),
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  );
  return true;
};

/**
 * The other way into the same shortcut: typing the closing `]` of a `[]` at the start of a line that already has a
 * space (or tab) right after the cursor, as in `[]| Buy groceries`. No Space is pressed there (one is already
 * there), so `insertTaskMarkerOnSpace` never runs; this converts as soon as the `[]` is complete. Whether the `]` is
 * typed over the one `closeBrackets()` just added or inserted fresh, the result is the same as for Space.
 *
 * Narrower than the Space command: it declines when nothing, or something other than whitespace, follows (then Space
 * is the trigger, as before), for a selection, during IME composition, and inside the same literal constructs. An
 * input handler, so it only sees typed characters; it must run before `closeBrackets()`'s own `]` handling.
 */
const taskMarkerOnClosingBracket: Extension = EditorView.inputHandler.of((view, from, to, text) => {
  const { state } = view;
  const { main } = state.selection;
  if (text !== ']' || view.composing || state.readOnly || state.selection.ranges.length !== 1 || !main.empty || from !== main.from || to !== from) {
    return false;
  }

  const line = state.doc.lineAt(from);
  const match = /^([ \t]*)\[$/.exec(state.sliceDoc(line.from, from));
  if (!match) {
    return false;
  }

  // `closeBrackets()` may already have added the `]`; typing it then steps over it instead of inserting.
  const restFrom = state.sliceDoc(from, from + 1) === ']' ? from + 1 : from;
  const spacesAfter = /^[ \t]*/.exec(state.sliceDoc(restFrom, line.to))![0].length;
  if (spacesAfter === 0 || insideLiteralBlock(state, from)) {
    return false;
  }

  const markerFrom = line.from + match[1]!.length;
  view.dispatch({
    changes: { from: markerFrom, to: restFrom + spacesAfter, insert: TASK_MARKER },
    selection: EditorSelection.cursor(markerFrom + TASK_MARKER.length),
    scrollIntoView: true,
    userEvent: 'input.type',
  });
  return true;
});

/** Both ways of typing the quick task shortcut: Space after `[]`, and the closing `]` before existing whitespace. */
export const taskMarkerCreationExtensions: Extension = taskMarkerOnClosingBracket;
