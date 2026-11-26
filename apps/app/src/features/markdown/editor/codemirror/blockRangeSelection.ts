import { EditorView } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import './blockRangeSelection.css';

const SELECTED_CLASS = 'cm-block-range-selected';

export function intersectsBlockRange(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some(range =>
    !range.empty && from < range.to && to > range.from
  );
}

/** The widget owns its exact source span; no DOM-coordinate inference or
 * independent selection state is needed. Called on creation and reuse. */
export function markBlockRange(element: HTMLElement, view: EditorView, from: number, to: number): void {
  element.dataset.blockRangeFrom = String(from);
  element.dataset.blockRangeTo = String(to);
  element.classList.toggle(SELECTED_CLASS, intersectsBlockRange(view.state, from, to));
}

/** Selection-only updates need not recreate images, PDFs or nested editors.
 * Limit the paint to widgets owned by this editor, not nested note views. */
export function syncBlockRangeSelection(view: EditorView): void {
  for (const element of view.contentDOM.querySelectorAll<HTMLElement>('[data-block-range-from][data-block-range-to]')) {
    if (element.closest('.cm-editor') !== view.dom) continue;
    element.classList.toggle(SELECTED_CLASS, intersectsBlockRange(
      view.state, Number(element.dataset.blockRangeFrom), Number(element.dataset.blockRangeTo)
    ));
  }
}

export function blockRangeSelection(): Extension {
  return EditorView.updateListener.of(update => {
    if (update.selectionSet || update.docChanged || update.viewportChanged || update.transactions.length) {
      syncBlockRangeSelection(update.view);
    }
  });
}
