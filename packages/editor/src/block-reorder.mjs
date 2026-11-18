import { BodyBlockSelection } from './body-selection.mjs';
import { blockRows } from './block-structure.mjs';

// The body is flat and each parent precedes its descendants. Scan once so
// overlapping explicit selections contribute each descendant exactly once.
export function blockMoveScope(doc, explicitIds) {
  const movingIds = new Set(explicitIds);
  const moved = [];
  const retained = [];
  const rows = blockRows(doc);
  for (const row of rows) {
    const { blockId, parentId } = row.node.attrs;
    if (movingIds.has(blockId) || movingIds.has(parentId)) {
      movingIds.add(blockId);
      moved.push(row);
    } else retained.push(row);
  }
  return { doc, rows, moved, retained };
}

export function planBlockMove(scope, slot) {
  const { rows, moved, retained } = scope;
  if (!moved.length || slot < 0 || slot > retained.length) return null;
  const order = [...retained.slice(0, slot), ...moved, ...retained.slice(slot)];
  let first = rows.length;
  let last = -1;
  const seen = new Set();
  for (const [index, row] of order.entries()) {
    const { blockId, parentId } = row.node.attrs;
    // Keep the parent relationship and indentation intact. A drop before
    // an unmoved parent (or after a remaining child) has no valid result.
    if (parentId !== null && !seen.has(parentId)) return null;
    seen.add(blockId);
    if (row !== rows[index]) {
      first = Math.min(first, index);
      last = index;
    }
  }
  if (last < 0) return null;
  return {
    from: rows[first].pos,
    to: rows[last].pos + rows[last].node.nodeSize,
    nodes: order.slice(first, last + 1).map(({ node }) => node),
  };
}

export function moveBlocks(state, scope, plan, explicitIds) {
  if (state.doc !== scope.doc || !plan) return null;
  const tr = state.tr.replaceWith(plan.from, plan.to, plan.nodes);
  return tr.setSelection(new BodyBlockSelection(tr.doc, explicitIds));
}
