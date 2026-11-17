import { Plugin } from 'prosemirror-state';
import {
  blockRows,
  descendantIds,
  parentAtIndent,
} from './block-structure.mjs';
// Capability derives from editable body text plus canonical indent metadata. Title,
// separators and object nodes cannot initiate indentation; no per-type whitelist.
export const canIndentBlock = (node) =>
  node.isTextblock && Number.isInteger(node.attrs.indent);
export function indentBlock(state, delta) {
  if (delta !== 1 && delta !== -1) throw Error('INVALID_INDENT_DELTA');
  const rows = blockRows(state.doc),
    id = state.selection.$from.parent.attrs.blockId;
  const index = rows.findIndex((r) => r.node.attrs.blockId === id),
    row = rows[index];
  if (!row || !canIndentBlock(row.node)) return null;
  const targets = descendantIds(state.doc, id),
    indent = row.node.attrs.indent + delta;
  if (
    rows.some(
      (r) =>
        targets.has(r.node.attrs.blockId) &&
        (r.node.attrs.indent + delta < 0 || r.node.attrs.indent + delta > 64)
    )
  )
    return null;
  let parentId = row.node.attrs.parentId;
  if (delta > 0) {
    // Only the immediately preceding same-level text sibling becomes a parent.
    for (let i = index - 1; i >= 0; i--) {
      const candidate = rows[i].node;
      if (candidate.attrs.indent > row.node.attrs.indent) continue;
      if (
        candidate.attrs.indent === row.node.attrs.indent &&
        canIndentBlock(candidate) &&
        candidate.attrs.parentId === parentId
      )
        parentId = candidate.attrs.blockId;
      break;
    }
  } else parentId = parentAtIndent(rows, parentId, indent);
  const tr = state.tr;
  for (const { node, pos } of rows)
    if (targets.has(node.attrs.blockId))
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        indent: node.attrs.indent + delta,
        ...(node.attrs.blockId === id ? { parentId } : {}),
      });
  return tr;
}

export function blockIndentation({ canEdit, stopCapturing }) {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (
          event.key !== 'Tab' ||
          canEdit?.() === false ||
          event.isComposing ||
          view.composing ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return false;
        const state = view.state,
          { $from, $to } = state.selection;
        if (
          $from.depth !== 1 ||
          !$from.sameParent($to) ||
          !canIndentBlock($from.parent)
        )
          return false;
        const tr = indentBlock(state, event.shiftKey ? -1 : 1);
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
