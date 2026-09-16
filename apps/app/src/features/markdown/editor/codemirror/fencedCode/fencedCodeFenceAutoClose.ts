import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * When typing the third backtick of a bare opening fence (` ``` ` alone on
 * its line) completes a new `FencedCode` node, auto-inserts a matching
 * closing fence on the next line as part of the same keystroke's own
 * transaction — so Undo removes it in one step. Cursor stays right after
 * the typed backtick so a language identifier can be typed immediately.
 *
 * Not built on `closeBrackets()` (`@codemirror/autocomplete`): its
 * triple-bracket support produces a same-line pair (`` ```│``` ``), never
 * a newline-separated block, so it can't produce this shape regardless of
 * configuration.
 *
 * Detection uses the real syntax tree (a throwaway candidate state with
 * just the plain backtick inserted) rather than a line regex, so it
 * naturally excludes inline/mid-line backticks (no `FencedCode` node
 * forms at all) and an existing block's own closing fence (that node's
 * `.from` is on an earlier line).
 */
export function fencedCodeFenceAutoClose(): Extension {
  return EditorView.inputHandler.of((view, from, to, insert) => {
    if (insert !== '`' || view.composing || view.state.readOnly) {
      return false;
    }

    const sel = view.state.selection.main;
    if (!sel.empty || from !== sel.from || to !== sel.to) {
      return false;
    }

    const candidate = view.state.update({ changes: { from, to, insert: '`' } });
    const pos = from + 1;
    const node = nearestFencedCode(candidate.state, pos);
    if (!node) {
      return false;
    }

    const cursorLine = candidate.state.doc.lineAt(pos);
    if (candidate.state.doc.lineAt(node.from).number !== cursorLine.number) {
      // This `FencedCode` node's opening line is earlier than the current
      // line — this backtick completes an existing block's closing fence.
      return false;
    }

    if (cursorLine.text.slice(node.from - cursorLine.from) !== '```') {
      // Something already follows the fence on this line (an info string
      // typed out of order), or this is a fourth+ backtick — out of scope.
      return false;
    }

    view.dispatch({
      changes: { from, to, insert: '`\n```' },
      selection: EditorSelection.cursor(from + 1),
      userEvent: 'input.type',
      scrollIntoView: true,
    });
    return true;
  });
}

/**
 * **Deliberately its own local copy — not `fencedCodeBlockLineDecoration.ts`'s
 * exported `nearestFencedCode` — verified by direct empirical comparison,
 * not assumed from the shared name alone (2026-09-16 audit finding).** The
 * two differ in exactly one place: this one resolves with
 * `resolveInner(pos, -1)` ("prefer the node ending here"); the shared one
 * uses `resolveInner(pos, 1)` ("prefer the node starting here"). That
 * single-character difference is not cosmetic — probed directly against a
 * mounted `EditorState` at this function's own real call shape (`pos`
 * immediately after a just-typed, still-unclosed `` ``` ``, nothing after
 * it — e.g. `resolveInner(3, ·)` against the doc `` ``` ``):
 * `resolveInner(pos, 1)` resolves to plain `Document`, with no `FencedCode`
 * anywhere in its ancestor chain at all, while `resolveInner(pos, -1)`
 * correctly resolves to `CodeMark > FencedCode > Document`. Using the
 * shared, `side: 1` implementation here would silently break auto-close
 * for its single most common trigger — typing the third backtick of a
 * brand-new, still-empty fence — which is exactly the case this whole
 * feature exists to handle. The shared function's own `side: 1` is
 * correct for *its* callers (all of which probe a position expected to
 * have real content *following* it — a line start, or just after an
 * existing opening mark), not for this one, which deliberately probes the
 * boundary immediately *after* content that may have nothing following it
 * yet. Do not consolidate these two without re-verifying this exact case.
 */
function nearestFencedCode(state: EditorState, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; node; node = node.parent) {
    if (node.name === 'FencedCode') {
      return node;
    }
  }
  return null;
}
