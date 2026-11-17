import {
  AllSelection,
  NodeSelection,
  Selection,
  TextSelection,
} from 'prosemirror-state';

// Choose a body destination after removing an object, never the title. Shared by
// local deletion and a selected object disappearing through another context.
export function bodySelectionNear(doc, at) {
  const titleEnd = doc.firstChild.nodeSize;
  at = Math.max(titleEnd, Math.min(at, doc.content.size));
  const $at = doc.resolve(at),
    previous = at > titleEnd ? $at.nodeBefore : null,
    next = $at.nodeAfter;
  if (previous?.isTextblock) return TextSelection.create(doc, at - 1);
  if (next?.isTextblock) return TextSelection.create(doc, at + 1);
  if (previous && NodeSelection.isSelectable(previous))
    return NodeSelection.create(doc, at - previous.nodeSize);
  if (next && NodeSelection.isSelectable(next))
    return NodeSelection.create(doc, at);
  return Selection.near($at);
}

// y-prosemirror's relative NodeSelection restore does not guard a deleted target
// at doc-end. Use public Y transaction events and PM selection APIs, with no fork
// or mutation of binding internals. The temporary AllSelection is selection-only,
// synchronous, not history and never persisted. Restore by canonical block ID.
export function guardNodeSelections(doc, views) {
  const pending = new Map();
  const before = () => {
    for (const view of views) {
      const selection = view.state.selection;
      if (!(selection instanceof NodeSelection)) continue;
      pending.set(view, {
        id: selection.node.attrs.blockId,
        pos: selection.from,
      });
      view.dispatch(
        view.state.tr.setSelection(new AllSelection(view.state.doc))
      );
    }
  };
  const after = () => {
    for (const [view, saved] of pending) {
      if (!views.has(view)) continue;
      let pos;
      view.state.doc.forEach((node, start) => {
        if (node.attrs.blockId === saved.id && NodeSelection.isSelectable(node))
          pos = start;
      });
      const selection =
        pos === undefined
          ? bodySelectionNear(view.state.doc, saved.pos)
          : NodeSelection.create(view.state.doc, pos);
      view.dispatch(view.state.tr.setSelection(selection));
    }
    pending.clear();
  };
  doc.on('beforeAllTransactions', before);
  doc.on('afterAllTransactions', after);
  return () => {
    doc.off('beforeAllTransactions', before);
    doc.off('afterAllTransactions', after);
    pending.clear();
  };
}
