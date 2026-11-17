import { blockRows } from './block-structure.mjs';
// Shared structural deletion for explicit block IDs. Object and block-selection
// adapters own their different cursor destinations, never a second content rule.
export function deleteBlocks(state, requested, nextId) {
  const rows = blockRows(state.doc),
    ids = new Set(requested),
    byId = new Map(rows.map(({ node }) => [node.attrs.blockId, node]));
  const selected = rows.filter(({ node }) => ids.has(node.attrs.blockId));
  if (!selected.length) return null;
  const tr = state.tr;
  for (const { node, pos } of rows) {
    if (ids.has(node.attrs.blockId) || !ids.has(node.attrs.parentId)) continue;
    let parentId = node.attrs.parentId;
    while (parentId && ids.has(parentId))
      parentId = byId.get(parentId)?.attrs.parentId ?? null;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, parentId });
  }
  for (const { node, pos } of selected.reverse())
    tr.delete(pos, pos + node.nodeSize);
  if (tr.doc.childCount === 1)
    tr.insert(
      tr.doc.firstChild.nodeSize,
      state.schema.nodes.paragraph.create({ blockId: nextId() })
    );
  return tr;
}
