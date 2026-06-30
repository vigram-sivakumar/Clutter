// @vitest-environment jsdom

/**
 * EditorController integration tests.
 * Tests the dispatch pipeline: ops → applyOp → invariant → selection repair → render.
 * Does NOT assert on DOM structure — only on state returned by getState().
 */

import { describe, it, expect } from 'vitest';
import { EditorController } from './editor-controller';
import type { EditorState, Node, PrimitiveOp } from '../engine/engine';
import { splitNodeCommand, mergeNodeCommand, indentCommand } from '../engine/commands';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeText(text: string): Node['inlines'] {
  return [{ type: 'text', text, marks: [] }];
}

function buildState(
  tree: Record<string, string[]>,
  opts: { texts?: Record<string, string>; selection?: EditorState['selection'] } = {}
): EditorState {
  const { texts = {}, selection = null } = opts;
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
          collapsed: false,
        };
      }
    }
  }

  return { nodes, rootId: 'root', selection };
}

function makeEl(): HTMLElement {
  return document.createElement('div');
}

// ---------------------------------------------------------------------------
// Root invariant — trailing empty node
// ---------------------------------------------------------------------------

describe('Root invariant (trailing empty node)', () => {
  it('adds trailing empty node when last root child has content — triggered via dispatch', () => {
    // Constructor does NOT enforce the invariant — it just renders the given state.
    // The invariant fires on the first dispatch call.
    const state = buildState(
      { root: ['A'] },
      { texts: { A: 'hello' }, selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 } }
    );
    const ctrl = new EditorController(state, makeEl());
    // Trigger invariant via a real edit op.
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 5, text: '!' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 6 }
    );
    const rootChildren = ctrl.getState().nodes['root']!.children;
    expect(rootChildren.length).toBe(2); // A + trailing empty
    const trailingId = rootChildren[rootChildren.length - 1]!;
    const trailing = ctrl.getState().nodes[trailingId]!;
    const inline = trailing.inlines[0];
    expect(inline?.type === 'text' && inline.text.trim()).toBe('');
  });

  it('does NOT add a second trailing node when last node is already empty', () => {
    const emptyId = 'E';
    const state = buildState(
      { root: ['A', emptyId] },
      {
        texts: { A: 'hello', [emptyId]: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    expect(ctrl.getState().nodes['root']!.children.length).toBe(2); // no extra node
  });

  it('adds trailing node when the only child has content, after dispatch', () => {
    // Start with a state that already has a trailing empty (valid initial state).
    const emptyId = 'TRAIL';
    const state = buildState(
      { root: ['A', emptyId] },
      {
        texts: { A: 'hi', [emptyId]: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 },
      }
    );
    const ctrl = new EditorController(state, makeEl());

    // Type into the trailing node — it now has content, so invariant must add a new trailing.
    ctrl.dispatch([
      { type: 'InsertText', nodeId: emptyId, inlineIndex: 0, offset: 0, text: 'new' },
    ]);

    const children = ctrl.getState().nodes['root']!.children;
    const lastId = children[children.length - 1]!;
    const lastNode = ctrl.getState().nodes[lastId]!;
    const inline = lastNode.inlines[0];
    expect(inline?.type === 'text' && inline.text.trim()).toBe('');
    // Should now have A, TRAIL (now 'new'), and a fresh trailing
    expect(children.length).toBe(3);
  });

  it('constructor does not enforce invariant — state is rendered as-is', () => {
    // The invariant (trailing empty node) is enforced only during dispatch, not construction.
    // EditorController renders whatever state it receives — callers are responsible for
    // passing valid initial state (the app always does this).
    const state = buildState(
      { root: ['A'] },
      { texts: { A: 'hello' }, selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 } }
    );
    const ctrl = new EditorController(state, makeEl());
    // Only 1 child — no trailing empty added at construction time.
    expect(ctrl.getState().nodes['root']!.children.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// dispatch — state transitions
// ---------------------------------------------------------------------------

describe('dispatch — state transitions', () => {
  it('applies a single InsertText op', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 5, text: ' world' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 11 }
    );
    const inline = ctrl.getState().nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
  });

  it('applies multiple ops in sequence', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'foo', B: 'bar', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    const ops: PrimitiveOp[] = [
      { type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 3, text: '!' },
      { type: 'InsertText', nodeId: 'B', inlineIndex: 0, offset: 3, text: '?' },
    ];
    ctrl.dispatch(ops);
    expect((ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text).toBe('foo!');
    expect((ctrl.getState().nodes['B']!.inlines[0] as { text: string }).text).toBe('bar?');
  });

  it('updates selection after dispatch', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 5, text: ' world' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 11 }
    );
    const sel = ctrl.getState().selection;
    expect(sel?.type).toBe('collapsed');
    if (sel?.type === 'collapsed') {
      expect(sel.offset).toBe(11);
    }
  });

  it('selection-only dispatch (empty ops) updates selection without ops', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'a', B: 'b', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch([], { type: 'collapsed', nodeId: 'B', inlineIndex: 0, offset: 1 });
    const sel = ctrl.getState().selection;
    expect(sel?.type).toBe('collapsed');
    if (sel?.type === 'collapsed') expect(sel.nodeId).toBe('B');
  });

  it('selection-only dispatch is a no-op for invalid node', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'a', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch([], { type: 'collapsed', nodeId: 'ghost', inlineIndex: 0, offset: 0 });
    const sel = ctrl.getState().selection;
    if (sel?.type === 'collapsed') expect(sel.nodeId).toBe('A'); // unchanged
  });
});

// ---------------------------------------------------------------------------
// dispatch — selection repair after delete
// ---------------------------------------------------------------------------

describe('dispatch — selection repair after delete', () => {
  it('repairs selection to surviving node when selected node is deleted', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'a', B: 'b', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'B', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch([
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: state.nodes['B']! },
    ]);
    const sel = ctrl.getState().selection;
    expect(sel?.type).toBe('collapsed');
    expect(ctrl.getState().nodes['B']).toBeUndefined();
    // caret should have moved to A or TRAIL
    if (sel?.type === 'collapsed') {
      expect(['A', 'TRAIL']).toContain(sel.nodeId);
    }
  });
});

// ---------------------------------------------------------------------------
// dispatch — commands via controller
// ---------------------------------------------------------------------------

describe('dispatch — split node', () => {
  it('split on Enter creates a new node below', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello world', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    const ops = splitNodeCommand(ctrl.getState(), 'A', 0, 5, 'NEW');
    ctrl.dispatch(ops, { type: 'collapsed', nodeId: 'NEW', inlineIndex: 0, offset: 0 });

    const children = ctrl.getState().nodes['root']!.children;
    expect(children.includes('NEW')).toBe(true);
    expect(children.indexOf('NEW')).toBe(children.indexOf('A') + 1);
    expect((ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text).toBe('hello');
    expect((ctrl.getState().nodes['NEW']!.inlines[0] as { text: string }).text).toBe(' world');
  });

  it('selection lands on new node after split', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello world', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    const ops = splitNodeCommand(ctrl.getState(), 'A', 0, 5, 'NEW');
    ctrl.dispatch(ops, { type: 'collapsed', nodeId: 'NEW', inlineIndex: 0, offset: 0 });

    const sel = ctrl.getState().selection;
    expect(sel?.type === 'collapsed' && sel.nodeId).toBe('NEW');
  });
});

describe('dispatch — merge node (Backspace)', () => {
  it('merge removes current node and joins text to previous', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'foo', B: 'bar', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'B', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    const ops = mergeNodeCommand(ctrl.getState(), 'B');
    ctrl.dispatch(ops, { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 3 });

    expect(ctrl.getState().nodes['B']).toBeUndefined();
    expect((ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text).toBe('foobar');
  });
});

describe('dispatch — indent', () => {
  it('indent makes B a child of A', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'a', B: 'b', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'B', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    const ops = indentCommand(ctrl.getState(), 'B');
    ctrl.dispatch(ops);

    expect(ctrl.getState().nodes['A']!.children).toContain('B');
    expect(ctrl.getState().nodes['B']!.parentId).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// undo / redo via controller
// ---------------------------------------------------------------------------

describe('undo / redo', () => {
  it('undo reverses an InsertText', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 5, text: ' world' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 11 }
    );
    expect((ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text).toBe('hello world');

    ctrl.undo();
    expect((ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text).toBe('hello');
  });

  it('redo re-applies after undo', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 5 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 5, text: ' world' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 11 }
    );
    ctrl.undo();
    ctrl.redo();
    expect((ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text).toBe('hello world');
  });

  it('undo of DeleteNode restores the node', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'a', B: 'b', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'B', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    ctrl.dispatch([
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: state.nodes['B']! },
    ]);
    expect(ctrl.getState().nodes['B']).toBeUndefined();

    ctrl.undo();
    expect(ctrl.getState().nodes['B']).toBeDefined();
    expect(ctrl.getState().nodes['root']!.children).toContain('B');
  });

  it('multiple undo/redo steps stay consistent', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: '', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());

    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 0, text: 'a' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 1 }
    );
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 1, text: 'b' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 2 }
    );
    ctrl.dispatch(
      [{ type: 'InsertText', nodeId: 'A', inlineIndex: 0, offset: 2, text: 'c' }],
      { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 3 }
    );

    ctrl.undo(); // undo 'c'
    ctrl.undo(); // undo 'b'
    const textAfter2Undos = (ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text;
    expect(textAfter2Undos).toBe('a');

    ctrl.redo(); // redo 'b'
    const textAfterRedo = (ctrl.getState().nodes['A']!.inlines[0] as { text: string }).text;
    expect(textAfterRedo).toBe('ab');
  });

  it('undo when history is empty does nothing', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    expect(() => ctrl.undo()).not.toThrow();
  });

  it('redo when future is empty does nothing', () => {
    const state = buildState(
      { root: ['A', 'TRAIL'] },
      {
        texts: { A: 'hello', TRAIL: '' },
        selection: { type: 'collapsed', nodeId: 'A', inlineIndex: 0, offset: 0 },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    expect(() => ctrl.redo()).not.toThrow();
  });

  it('undo after block-range delete restores all nodes', () => {
    const state = buildState(
      { root: ['A', 'B', 'TRAIL'] },
      {
        texts: { A: 'a', B: 'b', TRAIL: '' },
        selection: {
          type: 'block-range',
          startNodeId: 'A',
          endNodeId: 'B',
        },
      }
    );
    const ctrl = new EditorController(state, makeEl());
    const nodeA = state.nodes['A']!;
    const nodeB = state.nodes['B']!;
    ctrl.dispatch([
      { type: 'DeleteNode', id: 'B', parentId: 'root', index: 1, node: nodeB },
      { type: 'DeleteNode', id: 'A', parentId: 'root', index: 0, node: nodeA },
    ]);
    expect(ctrl.getState().nodes['A']).toBeUndefined();
    expect(ctrl.getState().nodes['B']).toBeUndefined();

    ctrl.undo();
    expect(ctrl.getState().nodes['A']).toBeDefined();
    expect(ctrl.getState().nodes['B']).toBeDefined();
  });
});
