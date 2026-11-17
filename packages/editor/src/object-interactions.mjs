import { deleteBlocks } from './block-deletion.mjs';
import { bodySelectionNear } from './node-selection-bridge.mjs';
import { Plugin, NodeSelection, TextSelection } from 'prosemirror-state';

// Shared atomic body-object selection and continuation. Selection is view-local;
// structural edits use the same context transaction/history/Core path as text.
export function selectedBodyObject(state) {
  const selection = state.selection;
  return selection instanceof NodeSelection &&
    selection.$from.depth === 0 &&
    selection.$from.index() > 0 &&
    selection.node.isBlock &&
    selection.node.isAtom &&
    !selection.node.isTextblock
    ? selection
    : null;
}
export function continueAfterObject(state, nextId) {
  const selected = selectedBodyObject(state);
  if (!selected) return null;
  const at = selected.to,
    next = state.doc.nodeAt(at);
  const { indent, parentId } = selected.node.attrs;
  const reuse =
    next?.type === state.schema.nodes.paragraph &&
    !next.content.size &&
    next.attrs.indent === indent &&
    next.attrs.parentId === parentId;
  const tr = state.tr;
  if (!reuse)
    tr.insert(
      at,
      state.schema.nodes.paragraph.create({
        blockId: nextId(),
        indent,
        parentId,
      })
    );
  return tr
    .setSelection(TextSelection.create(tr.doc, at + 1))
    .setStoredMarks([])
    .scrollIntoView();
}
export function deleteBodyObject(state, nextId) {
  const selected = selectedBodyObject(state);
  if (!selected) return null;
  const tr = deleteBlocks(state, [selected.node.attrs.blockId], nextId);
  if (!tr) return null;
  const at = selected.from;
  tr.setSelection(bodySelectionNear(tr.doc, at));
  return tr.setStoredMarks([]).scrollIntoView();
}
export function objectInteractions({ nextId, canEdit, stopCapturing } = {}) {
  return new Plugin({
    props: {
      handleClickOn(view, _pos, node, nodePos, event, direct) {
        if (
          canEdit?.() === false ||
          !direct ||
          event.button !== 0 ||
          event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          !node.isBlock ||
          !node.isAtom ||
          node.isTextblock ||
          !NodeSelection.isSelectable(node) ||
          view.state.doc.resolve(nodePos).depth !== 0 ||
          nodePos === 0
        )
          return false;
        view.dispatch(
          view.state.tr
            .setSelection(NodeSelection.create(view.state.doc, nodePos))
            .setMeta('addToHistory', false)
        );
        view.focus();
        return true;
      },
      handleKeyDown(view, event) {
        if (
          canEdit?.() === false ||
          event.isComposing ||
          view.composing ||
          event.shiftKey ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          !selectedBodyObject(view.state)
        )
          return false;
        let tr;
        if (event.key === 'Enter') tr = continueAfterObject(view.state, nextId);
        else if (event.key === 'Backspace' || event.key === 'Delete')
          tr = deleteBodyObject(view.state, nextId);
        else return false;
        if (tr.docChanged) stopCapturing?.();
        view.dispatch(tr);
        if (tr.docChanged) stopCapturing?.();
        view.focus();
        return true;
      },
    },
  });
}
