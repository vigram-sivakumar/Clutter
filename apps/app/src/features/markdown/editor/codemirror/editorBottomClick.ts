import { isolateHistory } from '@codemirror/commands';
import { EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';

/** The last rendered document block, not the editor's potentially padded
 * content box. CM6 block coordinates are relative to documentTop. */
export function focusEditorBottom(view: EditorView, clientY: number): boolean {
  if (view.state.readOnly) return false;
  const end = view.state.doc.length;
  const bottom = view.documentTop + view.lineBlockAt(end).bottom;
  if (!Number.isFinite(clientY) || !Number.isFinite(bottom) || clientY <= bottom) return false;

  // An existing trailing blank line (including an empty document) is the
  // target. Never add another line on repeated clicks.
  if (view.state.doc.lineAt(end).text.trim() === '') {
    view.dispatch({ selection: EditorSelection.cursor(end), scrollIntoView: true });
  } else {
    const expected = view.state.doc.toString() + '\n';
    const tr = view.state.update({
      changes: { from: end, insert: '\n' },
      selection: EditorSelection.cursor(end + 1),
      userEvent: 'input.editor.bottom',
      annotations: isolateHistory.of('full'),
      scrollIntoView: true,
    });
    // Keep the normal editor filters and edit permission checks intact.
    // Never focus an unsafe hidden boundary if the insertion was refused.
    if (tr.newDoc.toString() !== expected || tr.newSelection.main.head !== end + 1) return true;
    view.dispatch(tr);
    if (view.state.doc.toString() !== expected) return true;
  }
  view.focus();
  return true;
}

/** Inside-editor padding uses the same command as Page's outer padding.
 * Only bare root surfaces are eligible; cells, widgets, controls and
 * ordinary line clicks keep their own pointer handling. */
export const editorBottomClick = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {
    view.dom.addEventListener('mousedown', this.onMouseDown, true);
  }

  private onMouseDown = (event: MouseEvent): void => {
    const view = this.view;
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey ||
        event.altKey || event.defaultPrevented ||
        (event.target !== view.dom && event.target !== view.scrollDOM && event.target !== view.contentDOM)) return;
    if (focusEditorBottom(view, event.clientY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  destroy(): void {
    this.view.dom.removeEventListener('mousedown', this.onMouseDown, true);
  }
});
