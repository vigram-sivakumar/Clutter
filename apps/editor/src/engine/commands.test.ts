/**
 * Commands tests — every command produces correct ops, applies correctly, and round-trips through undo/redo.
 */

import { describe, it, expect } from 'vitest';
import {
  insertTextCommand,
  splitNodeCommand,
  mergeNodeCommand,
  indentCommand,
  outdentCommand,
  toggleMarkCommand,
} from './commands';
import { applyOp, validateStructure } from './engine';
import type { EditorState, Node, PrimitiveOp } from './engine';
import { pushEntry, undo, redo } from './history';
import type { HistoryState } from './history';

// ---------------------------------------------------------------------------
// Helpers (same pattern as engine.test.ts)
// ---------------------------------------------------------------------------

function makeText(text: string): Node['inlines'] {
  return [{ type: 'text', text, marks: [] }];
}

function buildState(
  tree: Record<string, string[]>,
  opts: { texts?: Record<string, string>; collapsed?: string[] } = {}
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

function applyOps(state: EditorState, ops: PrimitiveOp[]): EditorState {
  let s = state;
  for (const op of ops) s = applyOp(s, op);
  return s;
}

function undoOps(state: EditorState, ops: PrimitiveOp[]): EditorState {
  const h0: HistoryState = { past: [], future: [] };
  const h1 = pushEntry(h0, { label: 'cmd', ops, beforeSelection: null, afterSelection: null });
  return undo(state, h1).state;
}

// ---------------------------------------------------------------------------
// insertTextCommand
// ---------------------------------------------------------------------------

describe('insertTextCommand', () => {
  it('produces InsertText + NormalizeInline ops', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = insertTextCommand(state, 'A', 0, 5, ' world');
    expect(ops).toHaveLength(2);
    expect(ops[0]?.type).toBe('InsertText');
    expect(ops[1]?.type).toBe('NormalizeInline');
  });

  it('inserts text at the end correctly', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = insertTextCommand(state, 'A', 0, 5, ' world');
    const next = applyOps(state, ops);
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('inserts text at the start', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'world' } });
    const ops = insertTextCommand(state, 'A', 0, 0, 'hello ');
    const next = applyOps(state, ops);
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
  });

  it('returns empty ops for missing node', () => {
    const state = buildState({ root: [] });
    expect(insertTextCommand(state, 'ghost', 0, 0, 'x')).toEqual([]);
  });

  it('returns empty ops when inline is not text type', () => {
    const state: EditorState = {
      rootId: 'root',
      selection: null,
      nodes: {
        root: { id: 'root', parentId: null, blockType: 'root', inlines: [], children: ['A'], collapsed: false },
        A: { id: 'A', parentId: 'root', blockType: 'paragraph', inlines: [{ type: 'tag', id: 't1' }], children: [], collapsed: false },
      },
    };
    expect(insertTextCommand(state, 'A', 0, 0, 'x')).toEqual([]);
  });

  it('undo restores original text', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = insertTextCommand(state, 'A', 0, 5, ' world');
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);
    const inline = restored.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// splitNodeCommand
// ---------------------------------------------------------------------------

describe('splitNodeCommand', () => {
  it('splits node in the middle — head keeps prefix, new node gets suffix', () => {
    const state = buildState({ root: ['A', 'B'] }, { texts: { A: 'hello world' } });
    const ops = splitNodeCommand(state, 'A', 0, 5, 'NEW');
    const next = applyOps(state, ops);

    expect(next.nodes['root']!.children).toEqual(['A', 'NEW', 'B']);
    const aInline = next.nodes['A']!.inlines[0];
    expect(aInline?.type === 'text' && aInline.text).toBe('hello');
    const newInline = next.nodes['NEW']!.inlines[0];
    expect(newInline?.type === 'text' && newInline.text).toBe(' world');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('splits at offset 0 — head is empty, tail gets full text', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = splitNodeCommand(state, 'A', 0, 0, 'NEW');
    const next = applyOps(state, ops);

    expect(next.nodes['root']!.children).toEqual(['A', 'NEW']);
    const aInline = next.nodes['A']!.inlines[0];
    expect(aInline?.type === 'text' && aInline.text).toBe('');
    const newInline = next.nodes['NEW']!.inlines[0];
    expect(newInline?.type === 'text' && newInline.text).toBe('hello');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('splits at end — tail is empty', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = splitNodeCommand(state, 'A', 0, 5, 'NEW');
    const next = applyOps(state, ops);

    const aInline = next.nodes['A']!.inlines[0];
    expect(aInline?.type === 'text' && aInline.text).toBe('hello');
    const newInline = next.nodes['NEW']!.inlines[0];
    expect(newInline?.type === 'text' && newInline.text).toBe('');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('new node inherits blockType', () => {
    const state = buildState({ root: ['A'] });
    const before: EditorState = {
      ...state,
      nodes: { ...state.nodes, A: { ...state.nodes['A']!, blockType: 'heading1' } },
    };
    const ops = splitNodeCommand(before, 'A', 0, 2, 'NEW');
    const next = applyOps(before, ops);
    expect(next.nodes['NEW']!.blockType).toBe('heading1');
  });

  it('inserts new node after current — preserves existing siblings order', () => {
    const state = buildState({ root: ['A', 'B', 'C'] }, { texts: { B: 'hello world' } });
    const ops = splitNodeCommand(state, 'B', 0, 5, 'NEW');
    const next = applyOps(state, ops);
    expect(next.nodes['root']!.children).toEqual(['A', 'B', 'NEW', 'C']);
  });

  it('returns empty ops for root node (no parent)', () => {
    const state = buildState({ root: ['A'] });
    expect(splitNodeCommand(state, 'root', 0, 0, 'NEW')).toEqual([]);
  });

  it('undo of split restores original node and removes new node', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello world' } });
    const ops = splitNodeCommand(state, 'A', 0, 5, 'NEW');
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);

    expect(restored.nodes['root']!.children).toEqual(['A']);
    expect(restored.nodes['NEW']).toBeUndefined();
    const inline = restored.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
    expect(() => validateStructure(restored)).not.toThrow();
  });

  it('redo after undo re-splits', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello world' } });
    const ops = splitNodeCommand(state, 'A', 0, 5, 'NEW');
    const after = applyOps(state, ops);

    const h0: HistoryState = { past: [], future: [] };
    const h1 = pushEntry(h0, { label: 'split', ops, beforeSelection: null, afterSelection: null });
    const { state: undone, history: h2 } = undo(after, h1);
    const { state: redone } = redo(undone, h2);

    expect(redone.nodes['root']!.children).toEqual(['A', 'NEW']);
    expect(() => validateStructure(redone)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// mergeNodeCommand
// ---------------------------------------------------------------------------

describe('mergeNodeCommand', () => {
  it('removes current node and appends its text to previous', () => {
    const state = buildState({ root: ['A', 'B'] }, { texts: { A: 'foo', B: 'bar' } });
    const ops = mergeNodeCommand(state, 'B');
    const next = applyOps(state, ops);

    expect(next.nodes['root']!.children).toEqual(['A']);
    expect(next.nodes['B']).toBeUndefined();
    const inline = next.nodes['A']!.inlines[0];
    // NormalizeInline merges 'foo' + 'bar' → 'foobar'
    expect(inline?.type === 'text' && inline.text).toBe('foobar');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('moves children of merged node to the previous sibling', () => {
    const state = buildState({ root: ['A', 'B'], B: ['C', 'D'] });
    const ops = mergeNodeCommand(state, 'B');
    const next = applyOps(state, ops);

    expect(next.nodes['B']).toBeUndefined();
    expect(next.nodes['A']!.children).toEqual(['C', 'D']);
    expect(next.nodes['C']!.parentId).toBe('A');
    expect(next.nodes['D']!.parentId).toBe('A');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('appends children after existing children of the previous sibling', () => {
    const state = buildState(
      { root: ['A', 'B'], A: ['X'], B: ['C', 'D'] },
    );
    const ops = mergeNodeCommand(state, 'B');
    const next = applyOps(state, ops);

    expect(next.nodes['A']!.children).toEqual(['X', 'C', 'D']);
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('returns empty ops for the first node in parent (nothing to merge into)', () => {
    const state = buildState({ root: ['A', 'B'] });
    expect(mergeNodeCommand(state, 'A')).toEqual([]);
  });

  it('returns empty ops for missing node', () => {
    const state = buildState({ root: ['A'] });
    expect(mergeNodeCommand(state, 'ghost')).toEqual([]);
  });

  it('undo of merge restores both nodes and splits text back', () => {
    const state = buildState({ root: ['A', 'B'] }, { texts: { A: 'foo', B: 'bar' } });
    const ops = mergeNodeCommand(state, 'B');
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);

    expect(restored.nodes['root']!.children).toEqual(['A', 'B']);
    expect(restored.nodes['B']).toBeDefined();
    expect(() => validateStructure(restored)).not.toThrow();
  });

  it('undo of merge with children correctly restores children under original node', () => {
    const state = buildState({ root: ['A', 'B'], B: ['C', 'D'] });
    const ops = mergeNodeCommand(state, 'B');
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);

    expect(restored.nodes['B']!.children).toEqual(['C', 'D']);
    expect(restored.nodes['A']!.children).toEqual([]);
    expect(restored.nodes['C']!.parentId).toBe('B');
    expect(() => validateStructure(restored)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// indentCommand
// ---------------------------------------------------------------------------

describe('indentCommand', () => {
  it('makes node last child of previous sibling', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    const ops = indentCommand(state, 'B');
    const next = applyOps(state, ops);

    expect(next.nodes['root']!.children).toEqual(['A', 'C']);
    expect(next.nodes['A']!.children).toEqual(['B']);
    expect(next.nodes['B']!.parentId).toBe('A');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('appends after existing children of previous sibling', () => {
    const state = buildState({ root: ['A', 'B'], A: ['X', 'Y'] });
    const ops = indentCommand(state, 'B');
    const next = applyOps(state, ops);

    expect(next.nodes['A']!.children).toEqual(['X', 'Y', 'B']);
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('returns empty ops for the first child (no previous sibling)', () => {
    const state = buildState({ root: ['A', 'B'] });
    expect(indentCommand(state, 'A')).toEqual([]);
  });

  it('returns empty ops for missing node', () => {
    const state = buildState({ root: ['A'] });
    expect(indentCommand(state, 'ghost')).toEqual([]);
  });

  it('undo of indent restores node to original position', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });
    const ops = indentCommand(state, 'B');
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);

    expect(restored.nodes['root']!.children).toEqual(['A', 'B', 'C']);
    expect(restored.nodes['A']!.children).toEqual([]);
    expect(restored.nodes['B']!.parentId).toBe('root');
    expect(() => validateStructure(restored)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// outdentCommand
// ---------------------------------------------------------------------------

describe('outdentCommand', () => {
  it('moves node up to be next sibling after its parent', () => {
    const state = buildState({ root: ['A', 'B', 'D'], B: ['C'] });
    const ops = outdentCommand(state, 'C');
    const next = applyOps(state, ops);

    expect(next.nodes['root']!.children).toEqual(['A', 'B', 'C', 'D']);
    expect(next.nodes['B']!.children).toEqual([]);
    expect(next.nodes['C']!.parentId).toBe('root');
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('outdent when parent is last root child — node appended after parent', () => {
    const state = buildState({ root: ['A', 'B'], B: ['C'] });
    const ops = outdentCommand(state, 'C');
    const next = applyOps(state, ops);

    expect(next.nodes['root']!.children).toEqual(['A', 'B', 'C']);
    expect(() => validateStructure(next)).not.toThrow();
  });

  it('returns empty ops for root-level node (cannot outdent past root)', () => {
    const state = buildState({ root: ['A', 'B'] });
    expect(outdentCommand(state, 'A')).toEqual([]);
  });

  it('returns empty ops for missing node', () => {
    const state = buildState({ root: ['A'] });
    expect(outdentCommand(state, 'ghost')).toEqual([]);
  });

  it('undo of outdent restores node back under parent', () => {
    const state = buildState({ root: ['A', 'B', 'D'], B: ['C'] });
    const ops = outdentCommand(state, 'C');
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);

    expect(restored.nodes['B']!.children).toEqual(['C']);
    expect(restored.nodes['C']!.parentId).toBe('B');
    expect(restored.nodes['root']!.children).toEqual(['A', 'B', 'D']);
    expect(() => validateStructure(restored)).not.toThrow();
  });

  it('indent then outdent round-trips back to original state', () => {
    const state = buildState({ root: ['A', 'B', 'C'] });

    const indentOps = indentCommand(state, 'B');
    const indented = applyOps(state, indentOps);
    expect(indented.nodes['A']!.children).toEqual(['B']);

    const outdentOps = outdentCommand(indented, 'B');
    const roundTripped = applyOps(indented, outdentOps);

    expect(roundTripped.nodes['root']!.children).toEqual(['A', 'B', 'C']);
    expect(roundTripped.nodes['A']!.children).toEqual([]);
    expect(roundTripped.nodes['B']!.parentId).toBe('root');
    expect(() => validateStructure(roundTripped)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// toggleMarkCommand
// ---------------------------------------------------------------------------

describe('toggleMarkCommand', () => {
  it('adds bold mark when not present', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = toggleMarkCommand(state, 'A', 0, { type: 'bold' });
    const next = applyOps(state, ops);
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.marks.some((m) => m.type === 'bold')).toBe(true);
  });

  it('removes bold mark when already present', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const withBold = applyOp(state, { type: 'AddMark', nodeId: 'A', inlineIndex: 0, mark: { type: 'bold' } });
    const ops = toggleMarkCommand(withBold, 'A', 0, { type: 'bold' });
    const next = applyOps(withBold, ops);
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.marks.some((m) => m.type === 'bold')).toBe(false);
  });

  it('toggles italic independently of bold', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const withBold = applyOp(state, { type: 'AddMark', nodeId: 'A', inlineIndex: 0, mark: { type: 'bold' } });
    const ops = toggleMarkCommand(withBold, 'A', 0, { type: 'italic' });
    const next = applyOps(withBold, ops);
    const inline = next.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.marks.some((m) => m.type === 'bold')).toBe(true);
    expect(inline?.type === 'text' && inline.marks.some((m) => m.type === 'italic')).toBe(true);
  });

  it('returns empty ops for missing node', () => {
    const state = buildState({ root: [] });
    expect(toggleMarkCommand(state, 'ghost', 0, { type: 'bold' })).toEqual([]);
  });

  it('returns empty ops for non-text inline', () => {
    const state: EditorState = {
      rootId: 'root',
      selection: null,
      nodes: {
        root: { id: 'root', parentId: null, blockType: 'root', inlines: [], children: ['A'], collapsed: false },
        A: { id: 'A', parentId: 'root', blockType: 'paragraph', inlines: [{ type: 'tag', id: 't1' }], children: [], collapsed: false },
      },
    };
    expect(toggleMarkCommand(state, 'A', 0, { type: 'bold' })).toEqual([]);
  });

  it('undo of add-bold removes it again', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello' } });
    const ops = toggleMarkCommand(state, 'A', 0, { type: 'bold' });
    const after = applyOps(state, ops);
    const restored = undoOps(after, ops);
    const inline = restored.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.marks.some((m) => m.type === 'bold')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-command: split + merge round-trip
// ---------------------------------------------------------------------------

describe('split then merge round-trip', () => {
  it('split then merge restores original text', () => {
    const state = buildState({ root: ['A'] }, { texts: { A: 'hello world' } });

    const splitOps = splitNodeCommand(state, 'A', 0, 5, 'NEW');
    const split = applyOps(state, splitOps);

    const mergeOps = mergeNodeCommand(split, 'NEW');
    const merged = applyOps(split, mergeOps);

    expect(merged.nodes['root']!.children).toEqual(['A']);
    expect(merged.nodes['NEW']).toBeUndefined();
    const inline = merged.nodes['A']!.inlines[0];
    expect(inline?.type === 'text' && inline.text).toBe('hello world');
    expect(() => validateStructure(merged)).not.toThrow();
  });

  it('indent then outdent is identity', () => {
    const state = buildState({ root: ['A', 'B'] });

    const indentOps = indentCommand(state, 'B');
    const indented = applyOps(state, indentOps);

    const outdentOps = outdentCommand(indented, 'B');
    const restored = applyOps(indented, outdentOps);

    expect(restored.nodes['root']!.children).toEqual(['A', 'B']);
    expect(restored.nodes['A']!.children).toEqual([]);
    expect(() => validateStructure(restored)).not.toThrow();
  });
});
