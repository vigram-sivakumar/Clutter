import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** Constructs whose text is not Markdown prose: a `[]` typed inside one is just those characters. */
const LITERAL_BLOCKS: ReadonlySet<string> = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock', 'CommentBlock']);

/** Everything before the cursor is indentation and a bare `[]`. */
const BARE_BRACKETS = /^([ \t]*)\[\]$/;

/** What `[]` plus Space becomes: an unchecked task, ready for its text. */
export const TASK_MARKER = '- [ ] ';

/**
 * The `Space` keybinding that turns a bare `[]` at the start of a line into an unchecked task (`[]` → `- [ ] `), so
 * a task is started without typing the whole `- [ ] ` marker. The marker-creation counterpart of
 * `orderedListMarkerCreation.ts` (same keymap entry, `markdownEnterKeymap()`'s `Space`: that command runs first and
 * declines for anything that is not a bare ordered marker, then this one).
 *
 * Deliberately narrow, and a no-op (returns false, so the Space is typed as usual) for everything else:
 * - the `[]` must be the whole line up to the cursor, after indentation only, with the cursor at the end of the line.
 *   `see []`, `[]text`, `- []` (a bullet's own text) and `> []` (a quote's) are ordinary text;
 * - not inside fenced code, a code block, HTML or a comment;
 * - a single, empty selection.
 *
 * The typed Space is the marker's own separator, so the edit replaces the two brackets with `- [ ] ` and the cursor
 * lands after it. The result is a normal task: the parser makes it a `Task` with a `TaskMarker`, so rendering, the
 * checkbox, and Enter / Backspace behave exactly as for a task typed by hand. Indentation is kept as typed.
 */
export const insertTaskMarkerOnSpace: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) {
    return false;
  }

  const match = BARE_BRACKETS.exec(state.sliceDoc(line.from, pos));
  if (!match) {
    return false;
  }

  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (LITERAL_BLOCKS.has(node.name)) {
      return false;
    }
  }

  const markerFrom = line.from + match[1]!.length;
  dispatch(
    state.update({
      changes: { from: markerFrom, to: pos, insert: TASK_MARKER },
      selection: EditorSelection.cursor(markerFrom + TASK_MARKER.length),
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  );
  return true;
};
