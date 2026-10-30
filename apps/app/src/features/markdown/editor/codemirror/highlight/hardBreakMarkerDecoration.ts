import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import {
  findClusterBreak,
  type EditorState,
  type Extension,
  type Range,
  type StateCommand,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * The backslash of a Markdown hard break (`text\` + newline — what Shift+Enter writes) is syntax, not
 * content: it is collapsed (`Decoration.replace({})`, the same way ordinary hidden marks are) so the user
 * sees only a line break. The character stays in the document — it is what keeps the two lines one
 * paragraph when saved — and the tree decides which backslashes count (`HardBreak` nodes only: one at
 * the end of a block, escaped, or in a code span is real text and stays visible). The two-space break
 * has nothing visible to hide. Always hidden, not revealed by the caret: the break is a line break to
 * the user, never a character to edit.
 *
 * Registered in `atomicRanges` so Arrow keys step over it in one press; Backspace/Delete are the two
 * commands below, because a generic delete would otherwise remove the invisible character and appear to
 * do nothing.
 */

/** The hidden backslash ending `lineTo`'s line, or null when the line does not end in a backslash hard break. */
export function hardBreakBackslashEndingLine(
  state: EditorState,
  lineFrom: number,
  lineTo: number
): { readonly from: number; readonly to: number } | null {
  if (lineTo <= lineFrom || state.doc.sliceString(lineTo - 1, lineTo) !== '\\') {
    return null;
  }

  let found = false;
  syntaxTree(state).iterate({
    from: lineTo - 1,
    to: lineTo,
    enter: (node) => {
      if (node.name === 'HardBreak' && node.from === lineTo - 1) {
        found = true;
      }
      return !found;
    },
  });

  return found || isPendingBreak(state, lineFrom, lineTo)
    ? { from: lineTo - 1, to: lineTo }
    : null;
}

/** Whatever Shift+Enter writes after the break: quote markers and indentation, nothing else. */
const CONTINUATION_ONLY = /^(?:[ \t]*>[ \t]?)*[ \t]*$/;

/**
 * The moment right after Shift+Enter, before anything is typed: the new line is still empty, and a hard
 * break at the end of a block is not one yet to the parser (the backslash would be literal text), so the
 * tree has no `HardBreak`. The break is already the user's intent while the caret is on that new line,
 * so the backslash is hidden then — and only then: leave the line empty and the backslash is shown again,
 * because it really is a literal one.
 */
export function isPendingBreak(state: EditorState, lineFrom: number, lineTo: number): boolean {
  const { selection, doc } = state;
  const line = doc.lineAt(lineTo);
  if (line.number >= doc.lines || selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const next = doc.line(line.number + 1);
  if (selection.main.head < next.from || selection.main.head > next.to || !CONTINUATION_ONLY.test(next.text)) {
    return false;
  }

  // An odd run of backslashes ends the line (an even run is escaped, literal text), inside a paragraph.
  const trailing = /\\*$/.exec(doc.sliceString(lineFrom, lineTo))?.[0].length ?? 0;
  if (trailing % 2 === 0) {
    return false;
  }
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(lineTo, -1);
    node;
    node = node.parent
  ) {
    if (node.name === 'Paragraph') {
      return true;
    }
  }
  return false;
}

/**
 * The number of the line whose trailing backslash is a pending break right now (see {@link isPendingBreak}),
 * or null. Selection-dependent, unlike the document-derived spacing around it, so a spacing field that
 * uses it must also recompute when this changes.
 */
export function pendingBreakLineNumber(state: EditorState): number | null {
  const caretLine = state.doc.lineAt(state.selection.main.head);
  if (caretLine.number <= 1) {
    return null;
  }
  const prev = state.doc.line(caretLine.number - 1);
  return isPendingBreak(state, prev.from, prev.to) ? prev.number : null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const seen = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'HardBreak' || seen.has(node.from)) {
          return;
        }
        seen.add(node.from);
        const line = view.state.doc.lineAt(node.from);
        const hidden = hardBreakBackslashEndingLine(view.state, line.from, line.to);
        if (hidden && hidden.from === node.from) {
          ranges.push(Decoration.replace({}).range(hidden.from, hidden.to));
        }
      },
    });
  }

  // The pending break (see isPendingBreak) has no HardBreak node to find: look at the caret's line.
  const head = view.state.selection.main.head;
  const caretLine = view.state.doc.lineAt(head);
  if (caretLine.number > 1) {
    const prev = view.state.doc.line(caretLine.number - 1);
    const hidden = hardBreakBackslashEndingLine(view.state, prev.from, prev.to);
    if (hidden && !seen.has(hidden.from)) {
      ranges.push(Decoration.replace({}).range(hidden.from, hidden.to));
    }
  }

  return Decoration.set(ranges, true);
}

/** The leading quote markers and indentation of a continuation line — what Shift+Enter wrote after the break. */
const CONTINUATION_INDENT = /^(?:[ \t]*>[ \t]?)*[ \t]*/;

/**
 * Backspace around a hidden hard break. At the end of such a line the caret sits after the invisible
 * backslash, so it deletes the character before it (what the user sees); at the start of the next line's
 * text it removes the break itself — backslash, newline and the continuation indentation — joining the
 * lines. Anything else is not ours.
 */
export const deleteAroundHardBreakBackward: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return false;
  }

  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);

  const own = hardBreakBackslashEndingLine(state, line.from, line.to);
  if (own && pos === line.to) {
    const textBefore = state.doc.sliceString(line.from, own.from);
    const from = textBefore.trim() === '' ? own.from : findClusterBreak(textBefore, textBefore.length, false) + line.from;
    dispatch(state.update({ changes: { from, to: from === own.from ? own.to : own.from }, scrollIntoView: true, userEvent: 'delete.backward' }));
    return true;
  }

  if (line.number > 1) {
    const prev = state.doc.line(line.number - 1);
    const hidden = hardBreakBackslashEndingLine(state, prev.from, prev.to);
    const indent = CONTINUATION_INDENT.exec(line.text)?.[0] ?? '';
    if (hidden && pos === line.from + indent.length) {
      dispatch(state.update({ changes: { from: hidden.from, to: pos }, selection: { anchor: hidden.from }, scrollIntoView: true, userEvent: 'delete.backward' }));
      return true;
    }
  }

  return false;
};

/** Delete at the end of a line with a hidden hard break: removes the break and joins the next line. */
export const deleteAroundHardBreakForward: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return false;
  }

  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const hidden = hardBreakBackslashEndingLine(state, line.from, line.to);
  if (!hidden || pos < hidden.from || line.number === state.doc.lines) {
    return false;
  }

  const next = state.doc.line(line.number + 1);
  const indent = CONTINUATION_INDENT.exec(next.text)?.[0] ?? '';
  dispatch(state.update({ changes: { from: hidden.from, to: next.from + indent.length }, selection: { anchor: hidden.from }, scrollIntoView: true, userEvent: 'delete.forward' }));
  return true;
};

export function hardBreakMarkerDecoration(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet || syntaxTree(update.state) !== syntaxTree(update.startState)) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (self) =>
        EditorView.atomicRanges.of((view) => view.plugin(self)?.decorations ?? Decoration.none),
    }
  );

  return plugin;
}
