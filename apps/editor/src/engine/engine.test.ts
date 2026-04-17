/**
 * Engine unit tests — pure state transitions, no DOM.
 */

import { describe, it, expect } from 'vitest';
import {
  applyOp,
  getVisibleNodeIds,
  repairSelectionAfterDelete,
  validateStructure,
} from './engine';
import type { EditorState, Node, PrimitiveOp } from './engine';
import { pushEntry, undo, redo } from './history';
import type { HistoryState } from './history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeText(text: string): Node['inlines'] {
  return [{ type: 'text', text, marks: [] }];
}

/**
 * Build a test EditorState from a parent→children map.
 * Always uses 'root' as the root node id.
 * Nodes not listed as a key get an empty children array.
 */
function buildState(
  tree: Record<string, string[]>,
  opts: {
    texts?: Record<string, string>;
    collapsed?: string[];
  } = {}
): EditorState {
  const { texts = {}, collapsed = [] } = opts;
  const nodes: Record<string, Node> = {};

  nodes['root'] = {
    id: 'root',
    parentId: null,
    blockType: 'root',
    inlines: [],
    children: tree['root'] ?? [],
    collapsed: false,
  };

  for (const [parentId, children] of Object.entries(tree)) {
    for (const childId of children) {
      if (!nodes[childId]) {
        nodes[childId] = {
          id: childId,
          parentId,
          blockType: 'paragraph',
          inlines: makeText(texts[childId] ?? childId),
          children: tree[childId] ?? [],
          collapsed: collapsed.includes(childId),
        };
      }
    }
  }

  return { nodes, rootId: 'root', selection: null };
}

// ---------------------------------------------------------------------------
// applyOp — InsertNode
// ---------------------------------------------------------------------------

describe('applyOp InsertNode', () => {
  it('inserts a node at index 0', () => {
    const state = buildState({ root: ['A'] });
    const newNode: Node = {
      id: 'B',
      parentId: 'root',
      blockType: 'paragraph',
      inlines: makeText('B'),
      children: [],
      collapsed: false,
    };
    const next = applyOp(state, { type: 'InsertNode', id: 'B', parentId: 'root', index: 0, node: newNode });
    expect(next.nodes['root']!.children).toEqual(['B', 'A']);
    expect(next.nodes['B']).toBeDefined();
  });

  it('inserts a node at a middle index', () => {
    const state = buildState({ root: ['A', 'C'] });
    const newNode: Node = {
      id: 'B',
      parentId: 'root',
      blockType: 'paragraph',
      inlines: makeText('B'),
      children: [],
      collapsed: false,
    };
    const next = applyOp(state, { type: 'InsertNode', id: 'B', parentId: 'root', index: 1, node: newNode });
    expect(next.nodes['root']!.children).toEqual(['A', 'B', 'C']);
  });

  it('no-ops when node.parentId does not match op.parentId', () => {
    const state = buildState({ root: ['A'] });
    const badNode: Node = {
      id: 'B',
      parentId: 'wrong',
      blockType: 'paragraph',
      inlines: makeText('B'),
      children: [],
      collapsed: false,
    };
    const next = applyOp(state, { type: 'InsertNode', id: 'B', parentId: 'root', index: 0, node: badNode });
    expect(next).toBe(state);
  });

  it('no-ops when parent does not exist', () => {
    const state = buildState({ root: [] });
    const newNode: Node = {
      id: 'B',
      parentId: 'ghost',
      blockType: 'paragraph',
      inlines: makeText('B'),
      children: [],
      collapsed: false,
    };
    const next = applyOp(state, { type: 'InsertNode', id: 'B', parentId: 'ghost', index: 0, node: newNode });
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// applyOp — DeleteNode
// ---------------------------------------------------------------------------

describe('applyOp DeleteNode', () => {
  it('removes a leaf node from parent children and state', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    const nodeB = state.nodes['B']!;
    const next = applyOp(state, {
      type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB,
    });
    expect(next.nodes['root']!.children).toEqual(['A', 'C']);
    expect(next.nodes['B']).toBeUndefined();
  });

  it('does NOT cascade — children stay in state.nodes', () => {
    // B has children C and D. Deleting B without explicit child ops leaves C,D orphaned.
    // (Callers must generate leaf-first ops; this test confirms no implicit cascade.)
    const state = buildState({ root: ['A', 'B'], B: ['C', 'D'] });
    const nodeB = state.nodes['B']!;
    const next = applyOp(state, {
      type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB,
    });
    expect(next.nodes['B']).toBeUndefined();
    expect(next.nodes['C']).toBeDefined(); // C still in state (orphaned)
    expect(next.nodes['D']).toBeDefined(); // D still in state (orphaned)
  });

  it('no-ops when node is not in parent children', () => {
    const state = buildState({ root: ['A'] });
    const nodeB: Node = {
      id: 'B', parentId: 'root', blockType: 'paragraph',
      inlines: makeText('B'), children: [], collapsed: false,
    };
    const next = applyOp(state, {
      type: 'DeleteNode', id: 'B', parentId: 'root', index: 0, node: nodeB,
    });
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// applyOp — MoveNode
// ---------------------------------------------------------------------------

describe('applyOp MoveNode', () => {
  it('moves a node within the same parent', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    // Move A (index 0) to after C (index 3 → effectively end)
    const next = applyOp(state, {
      type: 'MoveNode', id: 'A',
      fromParentId: 'root', fromIndex: 0,
      toParentId: 'root', toIndex: 3,
    });
    expect(next.nodes['root']!.children).toEqual(['B', 'C', 'A']);
  });

  it('moves a node to a different parent', () => {
    const state = buildState({ root: ['A', 'B'], A: [] });
    const next = applyOp(state, {
      type: 'MoveNode', id: 'B',
      fromParentId: 'root', fromIndex: 1,
      toParentId: 'A', toIndex: 0,
    });
    expect(next.nodes['root']!.children).toEqual(['A']);
    expect(next.nodes['A']!.children).toEqual(['B']);
    expect(next.nodes['B']!.parentId).toBe('A');
  });

  it('adjusts toIndex when moving forward within same parent', () => {
    const state = buildState({ root: ['A', 'B', 'C', 'D'] });
    // Move A (0) to index 2 — after removal from 0, target index adjusts to 1
    const next = applyOp(state, {
      type: 'MoveNode', id: 'A',
      fromParentId: 'root', fromIndex: 0,
      toParentId: 'root', toIndex: 2,
    });
    expect(next.nodes['root']!.children).toEqual(['B', 'A', 'C', 'D']);
  });
});

// ---------------------------------------------------------------------------
// applyOp — SetBlockType / ToggleCollapse
// ---------------------------------------------------------------------------

describe('applyOp SetBlockType', () => {
  it('changes blockType', () => {
    const state = buildState({ root: ['A'] });
    const next = applyOp(state, {
      type: 'SetBlockType', nodeId: 'A', from: 'paragraph', to: 'heading1',
    });
    expect(next.nodes['A']!.blockType).toBe('heading1');
  });
});

describe('applyOp ToggleCollapse', () => {
  it('collapses a node', () => {
    const state = buildState({ root: ['A'], A: ['B'] });
    const next = applyOp(state, {
      type: 'ToggleCollapse', nodeId: 'A', from: false, to: true,
    });
    expect(next.nodes['A']!.collapsed).toBe(true);
  });

  it('expands a collapsed node', () => {
    const state = buildState({ root: ['A'], A: ['B'] }, { collapsed: ['A'] });
    const next = applyOp(state, {
      type: 'ToggleCollapse', nodeId: 'A', from: true, to: false,
    });
    expect(next.nodes['A']!.collapsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyOp — InsertText / DeleteText
// ---------------------------------------------------------------------------

describe('applyOp InsertText', () => {
  it('inserts text at offset 0', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'world' } });
    const next = applyOp(state, {
      type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 0, text: 'hello ',
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
  });

  it('inserts text in the middle', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'helo' } });
    const next = applyOp(state, {
      type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 3, text: 'l',
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello');
  });

  it('appends text at the end', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const next = applyOp(state, {
      type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 5, text: ' world',
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
  });
});

describe('applyOp DeleteText', () => {
  it('deletes a substring', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello world' } });
    const next = applyOp(state, {
      type: 'DeleteText', nodeId: 'A', inlineIndex: 0, offset: 5, length: 6, deletedText: ' world',
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello');
  });

  it('deletes from the start', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const next = applyOp(state, {
      type: 'DeleteText', nodeId: 'A', inlineIndex: 0, offset: 0, length: 5, deletedText: 'hello',
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// applyOp — AddMark / RemoveMark
// ---------------------------------------------------------------------------

describe('applyOp AddMark / RemoveMark', () => {
  it('adds a bold mark', () => {
    const state = buildState({ root: ['A'] });
    const next = applyOp(state, {
      type: 'AddMark', nodeId: 'A', inlineIndex: 0, mark: { type: 'bold' },
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.marks).toEqual([{ type: 'bold' }]);
  });

  it('removes a bold mark', () => {
    const state = buildState({ root: ['A'] });
    const withMark = applyOp(state, {
      type: 'AddMark', nodeId: 'A', inlineIndex: 0, mark: { type: 'bold' },
    });
    const next = applyOp(withMark, {
      type: 'RemoveMark', nodeId: 'A', inlineIndex: 0, mark: { type: 'bold' },
    });
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.marks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyOp — NormalizeInline
// ---------------------------------------------------------------------------

describe('applyOp NormalizeInline', () => {
  it('merges adjacent text segments with identical marks', () => {
    const state: EditorState = {
      rootId: 'root',
      selection: null,
      nodes: {
        root: { id: 'root', parentId: null, blockType: 'root', inlines: [], children: ['A'], collapsed: false },
        A: {
          id: 'A', parentId: 'root', blockType: 'paragraph', collapsed: false, children: [],
          inlines: [
            { type: 'text', text: 'hel', marks: [] },
            { type: 'text', text: 'lo', marks: [] },
          ],
        },
      },
    };
    const next = applyOp(state, { type: 'NormalizeInline', nodeId: 'A' });
    const inlines = next.nodes['A']!.inlines;
    expect(inlines).toHaveLength(1);
    expect(inlines[0]?.type === 'text' && inlines[0].text).toBe('hello');
  });

  it('removes empty text segments', () => {
    const state: EditorState = {
      rootId: 'root',
      selection: null,
      nodes: {
        root: { id: 'root', parentId: null, blockType: 'root', inlines: [], children: ['A'], collapsed: false },
        A: {
          id: 'A', parentId: 'root', blockType: 'paragraph', collapsed: false, children: [],
          inlines: [
            { type: 'text', text: '', marks: [] },
            { type: 'text', text: 'hello', marks: [] },
          ],
        },
      },
    };
    const next = applyOp(state, { type: 'NormalizeInline', nodeId: 'A' });
    const inlines = next.nodes['A']!.inlines;
    expect(inlines).toHaveLength(1);
    expect(inlines[0]?.type === 'text' && inlines[0].text).toBe('hello');
  });

  it('ensures at least one inline when all are empty', () => {
    const state: EditorState = {
      rootId: 'root',
      selection: null,
      nodes: {
        root: { id: 'root', parentId: null, blockType: 'root', inlines: [], children: ['A'], collapsed: false },
        A: {
          id: 'A', parentId: 'root', blockType: 'paragraph', collapsed: false, children: [],
          inlines: [{ type: 'text', text: '', marks: [] }],
        },
      },
    };
    const next = applyOp(state, { type: 'NormalizeInline', nodeId: 'A' });
    expect(next.nodes['A']!.inlines).toHaveLength(1);
    expect(next.nodes['A']!.inlines[0]?.type).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// getVisibleNodeIds
// ---------------------------------------------------------------------------

describe('getVisibleNodeIds', () => {
  it('returns flat list in order', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    expect(getVisibleNodeIds(state)).toEqual(['A', 'B', 'C']);
  });

  it('returns depth-first pre-order for nested tree', () => {
    // root → [A, B, F]  B → [C, D, E]
    const state = buildState({ root: ['A', 'B', 'F'], B: ['C', 'D', 'E'] });
    expect(getVisibleNodeIds(state)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('hides children of collapsed nodes', () => {
    const state = buildState(
      { root: ['A', 'B', 'C'], B: ['D', 'E'] },
      { collapsed: ['B'] }
    );
    expect(getVisibleNodeIds(state)).toEqual(['A', 'B', 'C']);
  });

  it('hides deeply nested children when ancestor is collapsed', () => {
    // A → [B → [C → [D]]]  collapse A
    const state = buildState(
      { root: ['A', 'E'], A: ['B'], B: ['C'], C: ['D'] },
      { collapsed: ['A'] }
    );
    expect(getVisibleNodeIds(state)).toEqual(['A', 'E']);
  });

  it('includes children of expanded nodes even when siblings are collapsed', () => {
    const state = buildState(
      { root: ['A', 'B'], A: ['X', 'Y'], B: ['P', 'Q'] },
      { collapsed: ['A'] }
    );
    expect(getVisibleNodeIds(state)).toEqual(['A', 'B', 'P', 'Q']);
  });
});

// ---------------------------------------------------------------------------
// Subtree delete + undo (explicit leaf-first ops)
// ---------------------------------------------------------------------------

describe('Subtree delete with explicit leaf-first ops', () => {
  it('correctly removes B and children C,D,E using explicit ops', () => {
    // root → [A, B, F]  B → [C, D, E]
    const state = buildState({ root: ['A', 'B', 'F'], B: ['C', 'D', 'E'] });

    // Leaf-first, descending indices: E(2), D(1), C(0), then B
    const ops: PrimitiveOp[] = [
      { type: 'DeleteNode', id: 'E', parentId: 'B', index: 2, node: state.nodes['E']! },
      { type: 'DeleteNode', id: 'D', parentId: 'B', index: 1, node: state.nodes['D']! },
      { type: 'DeleteNode', id: 'C', parentId: 'B', index: 0, node: { ...state.nodes['B']!, children: [] } },
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: { ...state.nodes['B']!, children: [] } },
    ];

    let next = state;
    for (const op of ops) next = applyOp(next, op);

    expect(next.nodes['B']).toBeUndefined();
    expect(next.nodes['C']).toBeUndefined();
    expect(next.nodes['D']).toBeUndefined();
    expect(next.nodes['E']).toBeUndefined();
    expect(next.nodes['root']!.children).toEqual(['A', 'F']);
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('undo of subtree delete restores full tree', () => {
    const state = buildState({ root: ['A', 'B', 'F'], B: ['C', 'D', 'E'] });

    const ops: PrimitiveOp[] = [
      { type: 'DeleteNode', id: 'E', parentId: 'B', index: 2, node: state.nodes['E']! },
      { type: 'DeleteNode', id: 'D', parentId: 'B', index: 1, node: state.nodes['D']! },
      { type: 'DeleteNode', id: 'C', parentId: 'B', index: 0, node: { ...state.nodes['C']!, children: [] } },
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: { ...state.nodes['B']!, children: [] } },
    ];

    let next = state;
    for (const op of ops) next = applyOp(next, op);

    const history: HistoryState = { past: [], future: [] };
    const pushed = pushEntry(history, {
      label: 'delete', ops,
      beforeSelection: null, afterSelection: null,
    });

    const { state: undone } = undo(next, pushed);

    expect(undone.nodes['B']).toBeDefined();
    expect(undone.nodes['C']).toBeDefined();
    expect(undone.nodes['D']).toBeDefined();
    expect(undone.nodes['E']).toBeDefined();
    expect(undone.nodes['B']!.children).toEqual(['C', 'D', 'E']);
    expect(undone.nodes['root']!.children).toEqual(['A', 'B', 'F']);
    expect(() => validateStructure(undone)).not.toThrow();
  });

  it('redo after undo re-deletes the subtree', () => {
    const state = buildState({ root: ['A', 'B', 'F'], B: ['C', 'D', 'E'] });

    const ops: PrimitiveOp[] = [
      { type: 'DeleteNode', id: 'E', parentId: 'B', index: 2, node: state.nodes['E']! },
      { type: 'DeleteNode', id: 'D', parentId: 'B', index: 1, node: state.nodes['D']! },
      { type: 'DeleteNode', id: 'C', parentId: 'B', index: 0, node: { ...state.nodes['C']!, children: [] } },
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: { ...state.nodes['B']!, children: [] } },
    ];

    let next = state;
    for (const op of ops) next = applyOp(next, op);

    const h0: HistoryState = { past: [], future: [] };
    const h1 = pushEntry(h0, { label: 'delete', ops, beforeSelection: null, afterSelection: null });

    const { state: undone, history: h2 } = undo(next, h1);
    const { state: redone } = redo(undone, h2);

    expect(redone.nodes['B']).toBeUndefined();
    expect(redone.nodes['root']!.children).toEqual(['A', 'F']);
    expect(() => validateStructure(redone)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// history — pushEntry, undo, redo
// ---------------------------------------------------------------------------

describe('history', () => {
  it('pushEntry clears the future', () => {
    const state = buildState({ root: ['A', 'B'] });
    const nodeB = state.nodes['B']!;

    const op: PrimitiveOp = { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB };
    const after = applyOp(state, op);

    const h0: HistoryState = { past: [], future: [] };
    const h1 = pushEntry(h0, { label: 'e1', ops: [op], beforeSelection: null, afterSelection: null });
    // Simulate undo to populate future
    const { history: h2 } = undo(after, h1);
    expect(h2.future).toHaveLength(1);

    // Now push a new entry — future must clear
    const h3 = pushEntry(h2, { label: 'e2', ops: [], beforeSelection: null, afterSelection: null });
    expect(h3.future).toHaveLength(0);
  });

  it('undo restores previous state', () => {
    const state = buildState({ root: ['A', 'B'] });
    const nodeB = state.nodes['B']!;
    const op: PrimitiveOp = { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB };
    const after = applyOp(state, op);

    const h0: HistoryState = { past: [], future: [] };
    const h1 = pushEntry(h0, { label: 'del', ops: [op], beforeSelection: null, afterSelection: null });

    const { state: undone } = undo(after, h1);
    expect(undone.nodes['B']).toBeDefined();
    expect(undone.nodes['root']!.children).toEqual(['A', 'B']);
  });

  it('redo re-applies the op', () => {
    const state = buildState({ root: ['A', 'B'] });
    const nodeB = state.nodes['B']!;
    const op: PrimitiveOp = { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB };
    const after = applyOp(state, op);

    const h0: HistoryState = { past: [], future: [] };
    const h1 = pushEntry(h0, { label: 'del', ops: [op], beforeSelection: null, afterSelection: null });

    const { state: undone, history: h2 } = undo(after, h1);
    const { state: redone } = redo(undone, h2);
    expect(redone.nodes['B']).toBeUndefined();
    expect(redone.nodes['root']!.children).toEqual(['A']);
  });

  it('multiple undo/redo steps work correctly', () => {
    const s0 = buildState({ root: ['A', 'B', 'C'] });
    let h: HistoryState = { past: [], future: [] };

    // Step 1: delete C
    const nodeC = s0.nodes['C']!;
    const op1: PrimitiveOp = { type: 'DeleteNode', id: 'C', parentId: 'root', index: 2, node: nodeC };
    const s1 = applyOp(s0, op1);
    h = pushEntry(h, { label: '1', ops: [op1], beforeSelection: null, afterSelection: null });

    // Step 2: delete B
    const nodeB = s1.nodes['B']!;
    const op2: PrimitiveOp = { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB };
    const s2 = applyOp(s1, op2);
    h = pushEntry(h, { label: '2', ops: [op2], beforeSelection: null, afterSelection: null });

    // Undo step 2 → B back
    const { state: s2u, history: h2u } = undo(s2, h);
    expect(s2u.nodes['B']).toBeDefined();
    expect(s2u.nodes['C']).toBeUndefined();

    // Undo step 1 → C back too
    const { state: s1u, history: h1u } = undo(s2u, h2u);
    expect(s1u.nodes['C']).toBeDefined();
    expect(s1u.nodes['root']!.children).toEqual(['A', 'B', 'C']);

    // Redo step 1 → C gone again
    const { state: sr1, history: hr1 } = redo(s1u, h1u);
    expect(sr1.nodes['C']).toBeUndefined();
    expect(sr1.nodes['B']).toBeDefined();

    // Redo step 2 → B gone
    const { state: sr2 } = redo(sr1, hr1);
    expect(sr2.nodes['B']).toBeUndefined();
    expect(sr2.nodes['root']!.children).toEqual(['A']);
  });
});

// ---------------------------------------------------------------------------
// repairSelectionAfterDelete
// ---------------------------------------------------------------------------

describe('repairSelectionAfterDelete', () => {
  it('returns null when there are no delete ops', () => {
    const state = buildState({ root: ['A', 'B'] });
    const ops: PrimitiveOp[] = [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 0, text: 'x' }];
    const result = repairSelectionAfterDelete(state, state, ops, {
      type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0,
    });
    expect(result).toBeNull();
  });

  it('returns null when selection does not reference a deleted node', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    const nodeC = state.nodes['C']!;
    const ops: PrimitiveOp[] = [{ type: 'DeleteNode', id: 'C', parentId: 'root', index: 2, node: nodeC }];
    const after = applyOp(state, ops[0]!);
    const result = repairSelectionAfterDelete(after, state, ops, {
      type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0,
    });
    expect(result).toBeNull();
  });

  it('repairs selection to surviving node when deleted node was selected', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    const nodeB = state.nodes['B']!;
    const ops: PrimitiveOp[] = [{ type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB }];
    const after = applyOp(state, ops[0]!);
    const result = repairSelectionAfterDelete(after, state, ops, {
      type: 'collapsed', nodeId: 'B', inlineIndex: 0, offset: 0,
    });
    expect(result).not.toBeNull();
    expect(result?.type).toBe('collapsed');
    // Should land on A (index 1 → now occupied by C) or C
    expect(['A', 'C']).toContain((result as { nodeId: string })?.nodeId);
  });

  it('repairs block-range selection to start of range', () => {
    const state = buildState({ root: ['A', 'B', 'C', 'D'] });
    const nodeB = state.nodes['B']!;
    const nodeC = state.nodes['C']!;
    const ops: PrimitiveOp[] = [
      { type: 'DeleteNode', id: 'C', parentId: 'root', index: 2, node: nodeC },
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB },
    ];
    let after = state;
    for (const op of ops) after = applyOp(after, op);

    const result = repairSelectionAfterDelete(after, state, ops, {
      type: 'block-range', startNodeId: 'B', endNodeId: 'C',
    });
    expect(result?.type).toBe('collapsed');
  });
});

// ---------------------------------------------------------------------------
// validateStructure
// ---------------------------------------------------------------------------

describe('validateStructure', () => {
  it('passes for a valid state', () => {
    const state = buildState({ root: ['A', 'B'], B: ['C', 'D'] });
    expect(() => validateStructure(state)).not.toThrow();
  });

  it('throws when a listed child is missing from state.nodes', () => {
    const state = buildState({ root: ['A'] });
    // Manually corrupt: add a ghost child to root
    const corrupt: EditorState = {
      ...state,
      nodes: {
        ...state.nodes,
        root: { ...state.nodes['root']!, children: ['A', 'GHOST'] },
      },
    };
    expect(() => validateStructure(corrupt)).toThrow();
  });

  it('throws for an orphan node', () => {
    const state = buildState({ root: ['A'] });
    const corrupt: EditorState = {
      ...state,
      nodes: {
        ...state.nodes,
        orphan: {
          id: 'orphan', parentId: 'root', blockType: 'paragraph',
          inlines: makeText('orphan'), children: [], collapsed: false,
        },
      },
    };
    expect(() => validateStructure(corrupt)).toThrow(/Orphan/);
  });

  it('throws when root is missing', () => {
    const state = buildState({ root: [] });
    const { root: _root, ...nodesWithoutRoot } = state.nodes;
    const corrupt: EditorState = { ...state, nodes: nodesWithoutRoot };
    expect(() => validateStructure(corrupt)).toThrow(/Root missing/);
  });

  it('throws when child parentId mismatches actual parent', () => {
    const state = buildState({ root: ['A', 'B'] });
    const corrupt: EditorState = {
      ...state,
      nodes: {
        ...state.nodes,
        A: { ...state.nodes['A']!, parentId: 'B' }, // A claims B is parent, but root owns A
      },
    };
    expect(() => validateStructure(corrupt)).toThrow(/Parent mismatch/);
  });
});
