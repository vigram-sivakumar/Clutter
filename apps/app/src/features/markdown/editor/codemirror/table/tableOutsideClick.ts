import type { EditorView } from '@codemirror/view';
import { TABLE_HANDLE_MENU_CLASS } from './tableHandleMenuSync';

/** Collapse root text selection when a click outside CM6 content reaches
 * an editor position. CM6 owns clicks within its content; the table engine
 * separately owns its cell/axis interactions and menu dismissal. */
export function attachTableOutsideClickHandling(view: EditorView): () => void {
  const handleMouseDown = (event: MouseEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(`.${TABLE_HANDLE_MENU_CLASS}`)) return;
    if (target instanceof Node && view.contentDOM.contains(target)) return;
    if (view.state.selection.main.empty) return;
    const anchor = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (anchor !== null) view.dispatch({ selection: { anchor } });
  };
  const doc = view.dom.ownerDocument;
  doc.addEventListener('mousedown', handleMouseDown);
  return () => doc.removeEventListener('mousedown', handleMouseDown);
}
