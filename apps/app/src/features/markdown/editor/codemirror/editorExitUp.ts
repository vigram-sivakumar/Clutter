import { Facet, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';

/**
 * Hands the caret off to whatever editable region sits above the editor (the page's description,
 * else its title). Given the caret's viewport x so the destination can land at the closest
 * horizontal position; returns whether focus actually moved (false: nothing above, so the
 * editor's own default ArrowUp behaviour should run unchanged).
 */
export type EditorExitUp = (clientX: number) => boolean;

const editorExitUpFacet = Facet.define<() => EditorExitUp | undefined, () => EditorExitUp | undefined>({
  combine: (values) => values[0] ?? (() => undefined),
});

/**
 * Whether the caret is on the document's first visual line — a wrapped first line counts only on
 * its own first row, matching what ArrowUp would otherwise do (move up a row, not leave).
 */
function isOnFirstVisualLine(view: EditorView, head: number): boolean {
  const caret = view.coordsAtPos(head);
  const first = view.coordsAtPos(0);
  if (!caret || !first) {
    // Cannot measure (e.g. a replaced widget): only the very first line is a safe "yes".
    return view.state.doc.lineAt(head).number === 1;
  }
  return Math.abs(caret.top - first.top) < (first.bottom - first.top) / 2;
}

/**
 * Leaves the editor upward at `clientX`, if a region above wants the caret. Shared by the root
 * keymap below and the table cell editors' own "exit above the table" path (a table that opens
 * the document has no line above it to exit onto).
 */
export function exitEditorUp(view: EditorView, clientX: number): boolean {
  const exit = view.state.facet(editorExitUpFacet)();
  return exit ? exit(clientX) : false;
}

/**
 * ArrowUp on the first visual line moves to the region above the editor instead of jumping the
 * caret to the document start. Declines (so the default cursorLineUp/table keymaps run untouched)
 * for everything else: a selection, any line below the first, or no region above to go to.
 * Only the root, editable editor installs this — a note embed's nested read-only view never does.
 */
export function editorExitUp(getExit: () => EditorExitUp | undefined): Extension {
  return [
    editorExitUpFacet.of(getExit),
    keymap.of([
      {
        key: 'ArrowUp',
        run: (view) => {
          const selection = view.state.selection.main;
          if (!selection.empty || !isOnFirstVisualLine(view, selection.head)) {
            return false;
          }
          const x = view.coordsAtPos(selection.head)?.left ?? view.contentDOM.getBoundingClientRect().left;
          return exitEditorUp(view, x);
        },
      },
    ]),
  ];
}
