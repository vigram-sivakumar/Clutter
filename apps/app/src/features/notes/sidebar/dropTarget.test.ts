// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { EDGE_BAND_RATIO, resolveDropRegion, resolveDropTarget, sameDropTarget, type DragRow } from './dropTarget';

const at = (height: number, ratio: number, canContain: boolean) =>
  resolveDropRegion({ top: 1000, height }, 1000 + height * ratio, canContain);

describe('resolveDropRegion', () => {
  it.each([20, 28, 40, 64])('uses the same proportional bands at row height %ipx', (height) => {
    expect(at(height, 0.0, true)).toBe('before');
    expect(at(height, EDGE_BAND_RATIO - 0.01, true)).toBe('before');
    expect(at(height, EDGE_BAND_RATIO + 0.01, true)).toBe('inside');
    expect(at(height, 0.5, true)).toBe('inside');
    expect(at(height, 1 - EDGE_BAND_RATIO - 0.01, true)).toBe('inside');
    expect(at(height, 1 - EDGE_BAND_RATIO + 0.01, true)).toBe('after');
    expect(at(height, 0.99, true)).toBe('after');
  });

  it('a row that cannot contain the item has no central band: the halves are before and after', () => {
    expect(at(28, 0.1, false)).toBe('before');
    expect(at(28, 0.49, false)).toBe('before');
    expect(at(28, 0.5, false)).toBe('after');
    expect(at(28, 0.9, false)).toBe('after');
  });

  it('is exclusive and exhaustive: every point is in exactly one region, with no gap at the boundaries', () => {
    const regions = new Set<string>();
    for (let step = 0; step < 100; step++) {
      regions.add(at(28, step / 100, true));
    }
    expect([...regions].sort()).toEqual(['after', 'before', 'inside']);
  });

  it('survives a zero-height rect', () => {
    expect(resolveDropRegion({ top: 0, height: 0 }, 0, true)).toBe('inside');
  });
});

describe('sameDropTarget', () => {
  const inside = { kind: 'inside', folderId: 'a', rect: { top: 1, left: 2, width: 3, height: 4 } } as const;
  const insert = { kind: 'insert', parentId: null, edge: 'before', rowId: 'a', rowKind: 'folder', line: { y: 1, left: 2, width: 3 } } as const;

  it('compares by value, and never equates the two kinds', () => {
    expect(sameDropTarget(null, null)).toBe(true);
    expect(sameDropTarget(inside, { ...inside })).toBe(true);
    expect(sameDropTarget(insert, { ...insert })).toBe(true);
    expect(sameDropTarget(inside, insert)).toBe(false);
    expect(sameDropTarget(inside, null)).toBe(false);
    expect(sameDropTarget(insert, { ...insert, line: { ...insert.line, y: 2 } })).toBe(false);
  });
});

describe('resolveDropTarget — a target outside the source container (a Collection View card)', () => {
  /** A rendered card/row at x 400+, outside a 260px sidebar. */
  function externalRow(id: string, kind: 'folder' | 'note', top: number, insideOnly = true): DragRow {
    const element = document.createElement('div');
    element.getBoundingClientRect = () =>
      ({ left: 400, top, width: 300, height: 40, right: 700, bottom: top + 40, x: 400, y: top, toJSON: () => ({}) }) as DOMRect;
    return { element, kind, id, parentId: 'projects', level: 0, tailHidden: false, insideOnly };
  }
  const rows = [externalRow('alpha', 'folder', 100), externalRow('n1', 'note', 160)];
  const over = (y: number, extra: Partial<Parameters<typeof resolveDropTarget>[0]> = {}) =>
    resolveDropTarget({
      pointer: { x: 550, y },
      dragged: { kind: 'folder', id: 'sidebar-folder', parentId: null },
      rows,
      canMoveFolderInto: () => true,
      canMoveNoteInto: () => true,
      ...extra,
    });

  it('finds a valid folder far outside the source container, as an "inside" target for the whole card', () => {
    expect(over(120)).toMatchObject({ kind: 'inside', folderId: 'alpha', rect: { left: 400, top: 100, width: 300, height: 40 } });
  });

  it('never offers a position there: the card\'s top and bottom edges are "inside" too, not before/after', () => {
    expect(over(101)).toMatchObject({ kind: 'inside', folderId: 'alpha' });
    expect(over(139)).toMatchObject({ kind: 'inside', folderId: 'alpha' });
  });

  it('a note row, the gap between cards and empty space are no target', () => {
    expect(over(180)).toBeNull(); // the note
    expect(over(150)).toBeNull(); // the gap
    expect(over(900)).toBeNull(); // empty space
  });

  it('rejects what the move rules reject: the dragged folder itself, its current parent, a descendant', () => {
    expect(over(120, { dragged: { kind: 'folder', id: 'alpha', parentId: 'projects' } })).toBeNull(); // itself
    expect(over(120, { dragged: { kind: 'folder', id: 'x', parentId: 'alpha' } })).toBeNull(); // already inside it
    expect(over(120, { canMoveFolderInto: () => false })).toBeNull(); // the domain says no
    expect(over(120, { canMoveFolderInto: undefined })).toBeNull(); // rules unavailable: never guessed
  });

  it('asks the note rules for a note, and offers nothing when they say no', () => {
    expect(over(120, { dragged: { kind: 'note', id: 'n9', parentId: null } })).toMatchObject({ kind: 'inside', folderId: 'alpha' });
    expect(over(120, { dragged: { kind: 'note', id: 'n9', parentId: null }, canMoveNoteInto: () => false })).toBeNull();
  });

  it('what a drop target offers belongs to the target: a sidebar row\'s edge is a position, a card\'s is not — for a drag from anywhere', () => {
    const sidebar = externalRow('side', 'folder', 100, false);
    sidebar.element.getBoundingClientRect = () => ({ left: 12, top: 100, width: 236, height: 28, right: 248, bottom: 128, x: 12, y: 100, toJSON: () => ({}) }) as DOMRect;
    const dragged = { kind: 'note' as const, id: 'n9', parentId: 'projects' }; // (the source is not an input: only the item's own identity is)
    const at = (x: number, y: number) =>
      resolveDropTarget({ pointer: { x, y }, dragged, rows: [sidebar, ...rows], canMoveFolderInto: () => true, canMoveNoteInto: () => true });

    expect(at(60, 101)).toMatchObject({ kind: 'insert', edge: 'before', rowId: 'side' }); // the sidebar row's top edge: a position
    expect(at(60, 114)).toMatchObject({ kind: 'inside', folderId: 'side' }); // its middle: into it
    expect(at(550, 101)).toMatchObject({ kind: 'inside', folderId: 'alpha' }); // a card's edge: still just "into"
  });
});

describe('resolveDropTarget — the empty space below the last row is the end of the top-level list', () => {
  const SIDEBAR = { left: 0, right: 260, top: 100, bottom: 700 };
  type Spec = { id: string; kind: 'folder' | 'note'; level: number; parent: string | null; tailHidden?: boolean };

  /** A sidebar scroll area with stacked 28px rows, in document order, like the Notes tree renders them. */
  function sidebar(specs: Spec[]) {
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    container.getBoundingClientRect = () =>
      ({ ...SIDEBAR, x: 0, y: SIDEBAR.top, width: 260, height: 600, toJSON: () => ({}) }) as DOMRect;
    const rows: DragRow[] = specs.map((spec, index) => {
      const element = document.createElement('div');
      element.className = 'entry';
      element.style.setProperty('--tree-level', String(spec.level));
      element.style.paddingLeft = `${12 + spec.level * 16}px`;
      const top = 100 + index * 28;
      element.getBoundingClientRect = () =>
        ({ left: 12, top, width: 236, height: 28, right: 248, bottom: top + 28, x: 12, y: top, toJSON: () => ({}) }) as DOMRect;
      container.append(element);
      return { element, kind: spec.kind, id: spec.id, parentId: spec.parent, level: spec.level, tailHidden: spec.tailHidden ?? false, insideOnly: false };
    });
    document.body.append(container);
    return { container, rows, bottom: 100 + specs.length * 28 };
  }
  afterEach(() => document.body.replaceChildren());

  const resolve = (
    tree: ReturnType<typeof sidebar>,
    dragged: Parameters<typeof resolveDropTarget>[0]['dragged'],
    pointer: { x: number; y: number },
    extra: Partial<Parameters<typeof resolveDropTarget>[0]> = {}
  ) =>
    resolveDropTarget({ pointer, dragged, rows: tree.rows, canMoveFolderInto: () => true, canMoveNoteInto: () => true, ...extra });

  const folderDrag = { kind: 'folder', id: 'x', parentId: 'elsewhere' } as const;
  const noteDrag = { kind: 'note', id: 'n', parentId: 'elsewhere' } as const;

  it('after the last root-level item: an insert after it at the root, drawn at its bottom edge', () => {
    const tree = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null }, { id: 'b', kind: 'folder', level: 0, parent: null }]);
    expect(resolve(tree, folderDrag, { x: 130, y: tree.bottom + 200 })).toEqual({
      kind: 'insert',
      parentId: null,
      edge: 'after',
      rowId: 'b',
      rowKind: 'folder',
      line: { y: tree.bottom, left: 12 + 12, width: 236 - 12 },
    });
  });

  it('below the last child of an expanded folder: after the FOLDER at the root, never into it — wherever the pointer is horizontally', () => {
    const tree = sidebar([
      { id: 'a', kind: 'folder', level: 0, parent: null },
      { id: 'a1', kind: 'note', level: 1, parent: 'a' },
      { id: 'a2', kind: 'folder', level: 1, parent: 'a' },
    ]);
    for (const x of [20, 130, 250]) {
      const target = resolve(tree, folderDrag, { x, y: tree.bottom + 80 });
      expect(target).toMatchObject({ kind: 'insert', parentId: null, edge: 'after', rowId: 'a' });
    }
  });

  it('a list ending in a mixed set of notes and folders: after the last top-level row, whatever kind it is', () => {
    const tree = sidebar([
      { id: 'a', kind: 'folder', level: 0, parent: null },
      { id: 'a1', kind: 'note', level: 1, parent: 'a' },
      { id: 'b', kind: 'folder', level: 0, parent: null },
      { id: 'b1', kind: 'note', level: 1, parent: 'b' },
      { id: 'b2', kind: 'folder', level: 1, parent: 'b' },
      { id: 'b3', kind: 'folder', level: 2, parent: 'b2' },
    ]);
    expect(resolve(tree, folderDrag, { x: 130, y: tree.bottom + 10 })).toMatchObject({ kind: 'insert', parentId: null, rowId: 'b', rowKind: 'folder', edge: 'after' });
    // The line sits under the whole last subtree.
    expect(resolve(tree, folderDrag, { x: 130, y: tree.bottom + 10 })).toMatchObject({ line: { y: tree.bottom } });
  });

  it('the last folder\'s children capped behind "N more": the space below it still means after that folder, at the root', () => {
    const tree = sidebar([
      { id: 'a', kind: 'folder', level: 0, parent: null },
      { id: 'a1', kind: 'note', level: 1, parent: 'a' },
      { id: 'a2', kind: 'note', level: 1, parent: 'a', tailHidden: true },
    ]);
    const more = document.createElement('div'); // the non-draggable "N more" row, a sibling entry at the children's level
    more.className = 'entry';
    more.style.setProperty('--tree-level', '1');
    more.getBoundingClientRect = () => ({ left: 12, top: 184, width: 236, height: 28, right: 248, bottom: 212, x: 12, y: 184, toJSON: () => ({}) }) as DOMRect;
    tree.container.append(more);
    expect(resolve(tree, folderDrag, { x: 130, y: 400 })).toMatchObject({ kind: 'insert', parentId: null, edge: 'after', rowId: 'a', line: { y: 212 } });

    // A root list that is itself capped has its real end hidden: nothing is offered.
    const capped = sidebar([{ id: 'r', kind: 'folder', level: 0, parent: null, tailHidden: true }]);
    const moreRoot = document.createElement('div');
    moreRoot.className = 'entry';
    moreRoot.getBoundingClientRect = () => ({ left: 12, top: 128, width: 236, height: 28, right: 248, bottom: 156, x: 12, y: 128, toJSON: () => ({}) }) as DOMRect;
    capped.container.append(moreRoot);
    expect(resolve(capped, folderDrag, { x: 130, y: 400 })).toBeNull();
  });

  it('a note has no place in the root list, so the empty space offers it nothing', () => {
    const tree = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null }, { id: 'a1', kind: 'note', level: 1, parent: 'a' }]);
    expect(resolve(tree, noteDrag, { x: 130, y: tree.bottom + 40 })).toBeNull();
  });

  it('asks the move rules: a destination they reject is no target', () => {
    const tree = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null }]);
    expect(resolve(tree, folderDrag, { x: 130, y: tree.bottom + 40 }, { canMoveFolderInto: () => false })).toBeNull();
    expect(resolve(tree, folderDrag, { x: 130, y: tree.bottom + 40 }, { canMoveFolderInto: undefined })).toBeNull();
  });

  it('is nothing for the item that is already the last one (no move), and for a capped list whose real end is hidden', () => {
    const tree = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null }, { id: 'b', kind: 'folder', level: 0, parent: null }]);
    expect(resolve(tree, { kind: 'folder', id: 'b', parentId: null }, { x: 130, y: tree.bottom + 40 })).toBeNull();

    const capped = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null, tailHidden: true }]);
    expect(resolve(capped, folderDrag, { x: 130, y: capped.bottom + 40 })).toBeNull();
  });

  it('the last child of the last folder dragged into the space moves out to after that folder', () => {
    const tree = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null }, { id: 'a1', kind: 'folder', level: 1, parent: 'a' }]);
    expect(resolve(tree, { kind: 'folder', id: 'a1', parentId: 'a' }, { x: 130, y: tree.bottom + 40 })).toMatchObject({
      kind: 'insert',
      parentId: null,
      rowId: 'a',
      edge: 'after',
    });
  });

  it('only the sidebar\'s own space counts: not beside it, not above the tree, not a row\'s own area', () => {
    const tree = sidebar([{ id: 'a', kind: 'folder', level: 0, parent: null }]);
    expect(resolve(tree, folderDrag, { x: 400, y: tree.bottom + 40 })).toBeNull(); // over the page
    expect(resolve(tree, folderDrag, { x: 130, y: SIDEBAR.bottom + 20 })).toBeNull(); // below the scroll area (the footer)
    expect(resolve(tree, folderDrag, { x: 130, y: 110 })).toMatchObject({ kind: 'inside', folderId: 'a' }); // over a row: the ordinary resolution
  });

  it('an empty tree has no row to anchor a position to: nothing is offered', () => {
    const tree = sidebar([]);
    expect(resolve(tree, folderDrag, { x: 130, y: 300 })).toBeNull();
  });
});
