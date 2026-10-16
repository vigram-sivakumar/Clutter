import { EditorSelection, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * The text of the document line at `pos`, without its line break.
 *
 * CodeMirror's own triple-click (`rangeForClick`, @codemirror/view) selects the line PLUS its trailing line
 * break (`to++`), the way most editors do. That is the one cause of both symptoms in a list item: the selection
 * ends at the start of the NEXT line (so the caret is drawn there, and typing would eat the break and join the
 * two lines), and `drawSelection()` paints a selection that includes a line break out to the full width of the
 * row instead of around the text.
 */
export function lineContentRange(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos);
  return { from: line.from, to: line.to };
}

/**
 * Triple-click selects the clicked line's text, not its line break — a documented CM6 hook
 * (`EditorView.mouseSelectionStyle`), used only for a plain triple-click. Everything else — single and double
 * click, shift- and ctrl/cmd-click, any other button — returns `null`, so CM6's default selection handling
 * runs exactly as before. Dragging after a triple-click extends by whole lines, as in CM6's own.
 */
export function tripleClickLineSelection(): Extension {
  return EditorView.mouseSelectionStyle.of((view, event) => {
    if (event.button !== 0 || event.detail !== 3 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
      return null;
    }

    const startPos = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false).pos;
    let start = lineContentRange(view.state, startPos);

    return {
      update(update) {
        if (update.docChanged) {
          const from = update.changes.mapPos(start.from);
          start = { from, to: Math.max(from, update.changes.mapPos(start.to)) };
        }
      },
      get(curEvent) {
        const cur = lineContentRange(
          view.state,
          view.posAndSideAtCoords({ x: curEvent.clientX, y: curEvent.clientY }, false).pos
        );
        return EditorSelection.single(Math.min(start.from, cur.from), Math.max(start.to, cur.to));
      },
    };
  });
}
