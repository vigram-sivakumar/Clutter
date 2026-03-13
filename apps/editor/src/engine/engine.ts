/**
 * Engine core — pure inline model. No DOM. No side effects. No random IDs.
 * All mutations via applyOp. Normalization only via NormalizeInline op.
 */

export type BlockType =
  | 'root'
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'task'
  | 'quote'
  | 'divider'
  | 'table';

export type Mark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'color'; value: string }
  | { type: 'highlight'; value: string };

export type Inline =
  | { type: 'text'; text: string; marks: Mark[] }
  | { type: 'tag'; id: string }
  | { type: 'mention'; id: string }
  | { type: 'date'; value: string }
  | { type: 'reference'; nodeId: string };

export type Node = {
  id: string;
  parentId: string | null;
  blockType: BlockType;
  inlines: Inline[];
  children: string[];
  collapsed: boolean;
};

export type EditorState = {
  nodes: Record<string, Node>;
  rootId: string;
};

export type PrimitiveOp =
  | {
      type: 'InsertNode';
      id: string;
      parentId: string;
      index: number;
      node: Node;
    }
  | {
      type: 'DeleteNode';
      id: string;
      parentId: string;
      index: number;
      node: Node;
    }
  | {
      type: 'MoveNode';
      id: string;
      fromParentId: string;
      fromIndex: number;
      toParentId: string;
      toIndex: number;
    }
  | {
      type: 'SetBlockType';
      nodeId: string;
      from: BlockType;
      to: BlockType;
    }
  | {
      type: 'ToggleCollapse';
      nodeId: string;
      from: boolean;
      to: boolean;
    }
  | {
      type: 'InsertText';
      nodeId: string;
      inlineIndex: number;
      offset: number;
      text: string;
    }
  | {
      type: 'DeleteText';
      nodeId: string;
      inlineIndex: number;
      offset: number;
      length: number;
      /** Stored so undo can apply InsertText inverse. */
      deletedText: string;
    }
  | {
      type: 'InsertInline';
      nodeId: string;
      inlineIndex: number;
      inline: Inline;
    }
  | {
      type: 'RemoveInline';
      nodeId: string;
      inlineIndex: number;
      /** Stored so undo can apply InsertInline inverse. */
      removedInline: Inline;
    }
  | {
      type: 'AddMark';
      nodeId: string;
      inlineIndex: number;
      mark: Mark;
    }
  | {
      type: 'RemoveMark';
      nodeId: string;
      inlineIndex: number;
      mark: Mark;
    }
  | {
      type: 'NormalizeInline';
      nodeId: string;
    };

function marksEqual(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ma = a[i]!;
    const mb = b[i]!;
    if (ma.type !== mb.type) return false;
    if ('value' in ma && 'value' in mb && ma.value !== mb.value) return false;
  }
  return true;
}

function isTextInline(inline: Inline): inline is { type: 'text'; text: string; marks: Mark[] } {
  return inline.type === 'text';
}

/**
 * Normalize inlines: remove empty text segments, merge adjacent text with identical marks,
 * ensure at least one empty text segment exists.
 */
function normalizeInlines(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (let i = 0; i < inlines.length; i++) {
    const inv = inlines[i]!;
    if (isTextInline(inv)) {
      if (inv.text.length === 0) continue;
      const prev = out[out.length - 1];
      if (prev && isTextInline(prev) && marksEqual(prev.marks, inv.marks)) {
        (out[out.length - 1] as { type: 'text'; text: string; marks: Mark[] }).text += inv.text;
      } else {
        out.push({ type: 'text', text: inv.text, marks: [...inv.marks] });
      }
    } else {
      out.push({ ...inv });
    }
  }
  if (out.length === 0) {
    out.push({ type: 'text', text: '', marks: [] });
  }
  return out;
}

function getNode(state: EditorState, nodeId: string): Node | undefined {
  return state.nodes[nodeId];
}

function setNode(state: EditorState, nodeId: string, node: Node): EditorState {
  const nodes = { ...state.nodes, [nodeId]: { ...node } };
  return { ...state, nodes };
}

function deleteNodeKey(state: EditorState, nodeId: string): EditorState {
  const nodes = { ...state.nodes };
  delete nodes[nodeId];
  return { ...state, nodes };
}

function updateNode(state: EditorState, nodeId: string, updater: (n: Node) => Node): EditorState {
  const node = state.nodes[nodeId];
  if (!node) return state;
  return setNode(state, nodeId, updater(node));
}

export function applyOp(state: EditorState, op: PrimitiveOp): EditorState {
  switch (op.type) {
    case 'InsertNode': {
      const parent = getNode(state, op.parentId);
      if (!parent) return state;
      if (op.node.parentId !== op.parentId) {
        return state;
      }
      const newChildren = [...parent.children];
      newChildren.splice(op.index, 0, op.id);
      const stateWithParent = setNode(state, op.parentId, { ...parent, children: newChildren });
      return setNode(stateWithParent, op.id, { ...op.node });
    }

    case 'DeleteNode': {
      const parent = getNode(state, op.parentId);
      if (!parent) return state;
      const idx = parent.children.indexOf(op.id);
      if (idx < 0) return state;
      const newChildren = parent.children.filter((_, i) => i !== idx);
      const stateWithoutChild = setNode(state, op.parentId, { ...parent, children: newChildren });
      return deleteNodeKey(stateWithoutChild, op.id);
    }

    case 'MoveNode': {
      const fromParent = getNode(state, op.fromParentId);
      const toParent = getNode(state, op.toParentId);
      if (!fromParent || !toParent) return state;
      const fromIdx = fromParent.children.indexOf(op.id);
      if (fromIdx < 0) return state;
      let targetIndex = op.toIndex;
      if (op.fromParentId === op.toParentId && fromIdx < op.toIndex) {
        targetIndex = op.toIndex - 1;
      }
      const node = getNode(state, op.id);
      if (!node) return state;
      let s = state;
      const fromChildren = fromParent.children.filter((_, i) => i !== fromIdx);
      s = setNode(s, op.fromParentId, { ...fromParent, children: fromChildren });
      const toChildren = [...toParent.children];
      toChildren.splice(targetIndex, 0, op.id);
      s = setNode(s, op.toParentId, { ...toParent, children: toChildren });
      return setNode(s, op.id, { ...node, parentId: op.toParentId });
    }

    case 'SetBlockType': {
      return updateNode(state, op.nodeId, (n) => ({ ...n, blockType: op.to }));
    }

    case 'ToggleCollapse': {
      return updateNode(state, op.nodeId, (n) => ({ ...n, collapsed: op.to }));
    }

    case 'InsertText': {
      return updateNode(state, op.nodeId, (n) => {
        const inlines = [...n.inlines];
        const seg = inlines[op.inlineIndex];
        if (!seg || seg.type !== 'text') return n;
        const before = seg.text.slice(0, op.offset);
        const after = seg.text.slice(op.offset);
        inlines[op.inlineIndex] = { ...seg, text: before + op.text + after };
        return { ...n, inlines };
      });
    }

    case 'DeleteText': {
      return updateNode(state, op.nodeId, (n) => {
        const inlines = [...n.inlines];
        const seg = inlines[op.inlineIndex];
        if (!seg || seg.type !== 'text') return n;
        const before = seg.text.slice(0, op.offset);
        const after = seg.text.slice(op.offset + op.length);
        inlines[op.inlineIndex] = { ...seg, text: before + after };
        return { ...n, inlines };
      });
    }

    case 'InsertInline': {
      return updateNode(state, op.nodeId, (n) => {
        const inlines = [...n.inlines];
        inlines.splice(op.inlineIndex, 0, op.inline);
        return { ...n, inlines };
      });
    }

    case 'RemoveInline': {
      return updateNode(state, op.nodeId, (n) => {
        const inlines = n.inlines.filter((_, i) => i !== op.inlineIndex);
        return { ...n, inlines };
      });
    }

    case 'AddMark': {
      return updateNode(state, op.nodeId, (n) => {
        const inlines = [...n.inlines];
        const seg = inlines[op.inlineIndex];
        if (!seg || seg.type !== 'text') return n;
        const marks = [...seg.marks, op.mark].sort((a, b) =>
          a.type.localeCompare(b.type)
        );
        inlines[op.inlineIndex] = { ...seg, marks };
        return { ...n, inlines };
      });
    }

    case 'RemoveMark': {
      return updateNode(state, op.nodeId, (n) => {
        const inlines = [...n.inlines];
        const seg = inlines[op.inlineIndex];
        if (!seg || seg.type !== 'text') return n;
        const markMatch = (m: Mark) => {
          if (m.type !== op.mark.type) return false;
          if ('value' in m && 'value' in op.mark) return m.value === (op.mark as { value: string }).value;
          return true;
        };
        const i = seg.marks.findIndex(markMatch);
        const marks = i < 0 ? seg.marks : seg.marks.filter((_, j) => j !== i);
        inlines[op.inlineIndex] = { ...seg, marks };
        return { ...n, inlines };
      });
    }

    case 'NormalizeInline': {
      return updateNode(state, op.nodeId, (n) => ({
        ...n,
        inlines: normalizeInlines(n.inlines),
      }));
    }

    default:
      return state;
  }
}
