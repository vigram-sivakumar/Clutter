import { Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import { blockRows, parentAtIndent } from './block-structure.mjs';

function changeOnly(state, convert) {
  const { $from } = state.selection,
    node = $from.parent,
    rows = blockRows(state.doc);
  let indent = node.attrs.indent,
    parentId = node.attrs.parentId;
  if (!convert) {
    indent--;
    parentId = parentAtIndent(rows, parentId, indent);
  }
  const attrs = {
    blockId: node.attrs.blockId,
    background: node.attrs.background,
    indent,
    parentId,
    ...(!convert && node.type.name === 'list_item'
      ? { listStyle: node.attrs.listStyle }
      : {}),
  };
  const tr = state.tr.setNodeMarkup(
    $from.before(),
    convert ? state.schema.nodes.paragraph : undefined,
    attrs
  );
  // Exiting/outdenting just this item does not carry its children. They keep their
  // indentation and grandchildren, detached to the old parent (or a free root).
  for (const { node: child, pos } of rows)
    if (child.attrs.parentId === node.attrs.blockId)
      tr.setNodeMarkup(pos, undefined, {
        ...child.attrs,
        parentId: node.attrs.parentId,
      });
  return tr;
}
export function listEnter(state, nextId) {
  const { $from, $to } = state.selection;
  if (!$from.sameParent($to) || $from.parent.type.name !== 'list_item')
    return null;
  if (!$from.parent.content.size)
    return changeOnly(state, $from.parent.attrs.indent === 0);
  const tr = state.tr.deleteSelection(),
    $at = tr.selection.$from,
    node = $at.parent,
    start = $at.before();
  const id = nextId(),
    prefix = node.content.cut(0, $at.parentOffset),
    suffix = node.content.cut($at.parentOffset);
  const first = node.type.create(node.attrs, prefix),
    sibling = node.type.create({ ...node.attrs, blockId: id }, suffix);
  tr.replaceWith(start, start + node.nodeSize, [first, sibling]);
  for (const { node: child, pos } of blockRows(tr.doc))
    if (child.attrs.parentId === node.attrs.blockId)
      tr.setNodeMarkup(pos, undefined, { ...child.attrs, parentId: id });
  return tr
    .setSelection(TextSelection.create(tr.doc, start + first.nodeSize + 1))
    .scrollIntoView();
}
function numbering(doc) {
  const counters = new Map(),
    decorations = [];
  for (const { node, pos } of blockRows(doc)) {
    const { indent, parentId, listStyle } = node.attrs,
      key = JSON.stringify([indent, parentId]);
    if (node.type.name !== 'list_item') {
      for (const [id, group] of counters)
        if (group.indent >= indent) counters.delete(id);
      continue;
    }
    const value =
      listStyle === 'ordered' ? (counters.get(key)?.count ?? 0) + 1 : 0;
    counters.set(key, { indent, count: value });
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        'data-marker': listStyle === 'ordered' ? value + '.' : '•',
      })
    );
  }
  return DecorationSet.create(doc, decorations);
}
export function listInteractions({ nextId, canEdit, stopCapturing }) {
  return new Plugin({
    props: {
      decorations: (state) => numbering(state.doc),
      handleKeyDown(view, event) {
        if (
          canEdit?.() === false ||
          event.isComposing ||
          view.composing ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return false;
        const state = view.state,
          { $from, $to, empty } = state.selection,
          node = $from.parent;
        if ($from.depth !== 1 || !$from.sameParent($to)) return false;
        const list = node.type.name === 'list_item',
          paragraph = node.type.name === 'paragraph';
        let tr;
        if (event.key === 'Enter' && list) {
          tr = event.shiftKey
            ? state.tr
                .replaceSelectionWith(
                  state.schema.nodes.hard_break.create(),
                  false
                )
                .scrollIntoView()
            : listEnter(state, nextId);
        } else if (
          event.key === 'Backspace' &&
          empty &&
          $from.parentOffset === 0 &&
          (list || (paragraph && node.attrs.indent > 0))
        )
          tr = changeOnly(state, list);
        else return false;
        if (tr?.docChanged) {
          stopCapturing();
          view.dispatch(tr);
          stopCapturing();
        }
        return true;
      },
    },
  });
}
