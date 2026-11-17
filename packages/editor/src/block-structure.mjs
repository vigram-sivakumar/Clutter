// Read-only selectors for the one canonical flat block graph. Shared by editing
// transforms; visual DOM nesting/indent rectangles do not own parentage.
export function blockRows(doc) {
  const rows = [];
  doc.forEach((node, pos, index) => {
    if (index) rows.push({ node, pos });
  });
  return rows;
}
export function descendantIds(doc, blockId) {
  const ids = new Set([blockId]);
  for (const { node } of blockRows(doc))
    if (ids.has(node.attrs.parentId)) ids.add(node.attrs.blockId);
  return ids;
}
export function afterSubtree(doc, blockId) {
  const ids = descendantIds(doc, blockId);
  let end;
  for (const { node, pos } of blockRows(doc))
    if (ids.has(node.attrs.blockId)) end = pos + node.nodeSize;
  if (end === undefined) throw Error('BLOCK_NOT_FOUND');
  return end;
}
