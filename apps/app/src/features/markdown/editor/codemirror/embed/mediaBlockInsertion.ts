import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { listItemMarker, separatorRangeAfter } from '../list/listMarkerDecoration';
import { pasteContextAt } from '../paste/pasteContext';
import { findEnclosingTable } from '../table/tableGeometry';

interface MediaInsertion {
  readonly changes: { from: number; to: number; insert: string }[];
  readonly from: number;
  readonly to: number;
}

/** The item's Markdown continuation prefix, not another task or bullet marker. */
function continuationPrefix(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos);
  let markerFrom = Infinity;
  let prefix: string | undefined;
  syntaxTree(state).iterate({
    from: line.from, to: line.to,
    enter(node) {
      if (node.name !== 'ListItem') return;
      const marker = listItemMarker(node.node);
      if (!marker || marker.from < line.from || marker.from >= line.to || marker.from >= markerFrom) return;
      const separator = separatorRangeAfter(state, marker);
      if (!separator) return;
      markerFrom = marker.from;
      prefix = state.sliceDoc(line.from, marker.from) + ' '.repeat(separator.to - marker.from);
    },
  });
  // Preserve existing indentation and quote markers on continuation lines.
  return prefix ?? /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(line.text)![0];
}

/**
 * One placement policy for a newly inserted media block. The range is the
 * selection being replaced (paste), or the completion's entire trigger.
 * Outside that range, the existing line is never split or rewritten.
 * The returned span describes the inserted body in post-change coordinates.
 */
export function planMediaBlockInsertion(state: EditorState, range: { from: number; to: number }, body: string): MediaInsertion {
  const { from, to } = range;
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  // Do not create new block lines inside literal code or a table row.
  if (findEnclosingTable(state, from) || pasteContextAt(state, from) === 'code') {
    return { changes: [{ from, to, insert: body }], from, to: from + body.length };
  }
  const before = state.sliceDoc(first.from, from);
  const after = state.sliceDoc(to, last.to);
  const prefix = continuationPrefix(state, from);
  const withPrefix = body.split('\n').join('\n' + prefix);
  if (!before.trim() && !after.trim()) {
    const leading = before;
    return {
      changes: [{ from: first.from, to: last.to, insert: leading + withPrefix }],
      from: first.from + leading.length,
      to: first.from + leading.length + withPrefix.length,
    };
  }
  const block = '\n' + prefix + withPrefix;
  const blockFrom = last.to - (to - from) + 1 + prefix.length;
  // Combine adjacent changes at the end of a line; otherwise leave the
  // existing suffix in place so its editor state and text are preserved.
  const changes = to === last.to
    ? [{ from, to, insert: block }]
    : [...(from === to ? [] : [{ from, to, insert: '' }]), { from: last.to, to: last.to, insert: block }];
  return { changes, from: blockFrom, to: blockFrom + withPrefix.length };
}
