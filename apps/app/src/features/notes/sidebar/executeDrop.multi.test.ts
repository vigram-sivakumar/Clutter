import { describe, expect, it, vi } from 'vitest';
import { executeDrop, type DropActions } from './executeDrop';
import { wholeDragOracles, type DragItem, type DropTarget } from './dropTarget';
import { placeManyInOrder } from './sidebarSort';

const note = (id: string, parentId: string | null = 'src'): DragItem => ({ kind: 'note', id, parentId });
const folder = (id: string, parentId: string | null = 'src'): DragItem => ({ kind: 'folder', id, parentId });
/** A drag carrying `items`, the first of which is the one pressed. */
const dragOf = (...items: DragItem[]): DragItem => ({ ...items[0]!, items });

const inside = (folderId: string, zone?: 'inbox' | 'templates'): DropTarget => ({
  kind: 'inside',
  folderId,
  zone,
  rect: { top: 0, left: 0, width: 1, height: 1 },
});

function actions(overrides: Partial<DropActions> = {}) {
  const spies = {
    onMoveNote: vi.fn(async (_id: string, _destination: string | null, _options?: unknown) => {}),
    onMoveFolder: vi.fn(async (_id: string, _destination: string | null, _options?: unknown) => {}),
    canMoveFolderInto: vi.fn(() => true),
    canMoveNoteInto: vi.fn(() => true),
  };
  return { spies, actions: { ...spies, ...overrides } as DropActions };
}

describe('executeDrop — several items dragged together', () => {
  it('moves every note, once each, in the selection\'s order, quietly', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(note('n2'), note('n1'), note('n3')), inside('dest'), a)).toBe('moved');

    expect(spies.onMoveNote.mock.calls).toEqual([
      ['n2', 'dest', { silent: true }],
      ['n1', 'dest', { silent: true }],
      ['n3', 'dest', { silent: true }],
    ]);
  });

  it('moves a mixed selection: folders after the rules are asked for each, notes beside them', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(folder('f1'), note('n1'), folder('f2')), inside('dest'), a)).toBe('moved');

    expect(spies.canMoveFolderInto).toHaveBeenCalledWith('f1', 'dest');
    expect(spies.canMoveFolderInto).toHaveBeenCalledWith('f2', 'dest');
    expect(spies.onMoveFolder).toHaveBeenCalledTimes(2);
    expect(spies.onMoveNote).toHaveBeenCalledExactlyOnceWith('n1', 'dest', { silent: true });
  });

  it('skips items already in the destination as no-ops, and moves the rest', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(note('n1', 'dest'), note('n2')), inside('dest'), a)).toBe('moved');

    expect(spies.onMoveNote).toHaveBeenCalledExactlyOnceWith('n2', 'dest', { silent: true });
  });

  it('a drop where every item is already there changes nothing', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(note('n1', 'dest'), folder('f1', 'dest')), inside('dest'), a)).toBe('ignored');

    expect(spies.onMoveNote).not.toHaveBeenCalled();
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('a duplicate id in the drag is moved once', async () => {
    const { spies, actions: a } = actions();

    await executeDrop(dragOf(note('n1'), note('n1'), note('n2')), inside('dest'), a);

    expect(spies.onMoveNote.mock.calls.map(([id]) => id)).toEqual(['n1', 'n2']);
  });

  it('an item that cannot move (a name collision) is skipped silently; the rest still move and nothing is undone', async () => {
    const onMoveNote = vi.fn(async (id: string, _destination: string | null) => {
      if (id === 'n2') throw new Error('A note named "N2" already exists in this folder.');
    });
    const { actions: a } = actions({ onMoveNote });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await executeDrop(dragOf(note('n1'), note('n2'), note('n3')), inside('dest'), a)).toBe('moved');

    expect(onMoveNote.mock.calls.map(([id]) => id)).toEqual(['n1', 'n2', 'n3']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('when nothing could move, the drop is rejected (still silently)', async () => {
    const onMoveNote = vi.fn(async () => {
      throw new Error('no');
    });
    const { actions: a } = actions({ onMoveNote });

    expect(await executeDrop(dragOf(note('n1'), note('n2')), inside('dest'), a)).toBe('rejected');
  });

  it('a folder the rules refuse rejects the WHOLE drop before anything moves', async () => {
    const { spies, actions: a } = actions({ canMoveFolderInto: vi.fn((id: string) => id !== 'f2') });

    expect(await executeDrop(dragOf(note('n1'), folder('f1'), folder('f2')), inside('dest'), a)).toBe('rejected');

    expect(spies.onMoveNote).not.toHaveBeenCalled();
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('Inbox takes notes only: any folder in the drag rejects the entire drop', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(note('n1'), folder('f1')), inside('inbox-id', 'inbox'), a)).toBe('rejected');
    expect(await executeDrop(dragOf(folder('f1'), folder('f2')), inside('inbox-id', 'inbox'), a)).toBe('rejected');

    expect(spies.onMoveNote).not.toHaveBeenCalled();
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('Inbox takes a selection of notes', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(note('n1'), note('n2')), inside('inbox-id', 'inbox'), a)).toBe('moved');

    expect(spies.onMoveNote).toHaveBeenCalledTimes(2);
  });

  it('Templates takes notes and folders together', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(dragOf(note('n1'), folder('f1')), inside('tpl', 'templates'), a)).toBe('moved');

    expect(spies.onMoveNote).toHaveBeenCalledOnce();
    expect(spies.onMoveFolder).toHaveBeenCalledOnce();
  });

  describe('reordering several items', () => {
    const insert = (parentId: string | null = 'src'): DropTarget => ({
      kind: 'insert',
      parentId,
      edge: 'before',
      rowId: 'x',
      rowKind: 'note',
      line: { y: 0, left: 0, width: 1 },
    });

    it('places them together at the position, in a Manual level, without moving anything', async () => {
      const placeSibling = vi.fn();
      const { spies, actions: a } = actions({ placeSibling, canReorderLevel: () => true });
      const drag = dragOf(note('n1'), note('n2'));

      expect(await executeDrop(drag, insert(), a)).toBe('reordered');

      expect(placeSibling).toHaveBeenCalledExactlyOnceWith(drag, 'src', { kind: 'note', id: 'x' }, 'before');
      expect(spies.onMoveNote).not.toHaveBeenCalled();
    });

    it('is refused in a level that is not Manual — nothing is written', async () => {
      const placeSibling = vi.fn();
      const { actions: a } = actions({ placeSibling, canReorderLevel: () => false });

      expect(await executeDrop(dragOf(note('n1'), note('n2')), insert(), a)).toBe('rejected');

      expect(placeSibling).not.toHaveBeenCalled();
    });

    it('is refused for a position in another folder (several items are never moved and placed in one go)', async () => {
      const placeSibling = vi.fn();
      const { spies, actions: a } = actions({ placeSibling, canReorderLevel: () => true });

      expect(await executeDrop(dragOf(note('n1'), note('n2')), insert('elsewhere'), a)).toBe('rejected');

      expect(placeSibling).not.toHaveBeenCalled();
      expect(spies.onMoveNote).not.toHaveBeenCalled();
    });
  });

  it('a single item (no `items`) is exactly the existing single drop — reported, not silent', async () => {
    const { spies, actions: a } = actions();

    expect(await executeDrop(note('n1'), inside('dest'), a)).toBe('moved');

    expect(spies.onMoveNote).toHaveBeenCalledExactlyOnceWith('n1', 'dest');
  });
});

describe('wholeDragOracles — what the hover offers agrees with what the drop does', () => {
  const rules = (blocked: Record<string, string[]> = {}) => ({
    canMoveFolderInto: (id: string, destination: string | null) => !(blocked[id] ?? []).includes(String(destination)),
    canMoveNoteInto: (id: string, destination: string | null) => !(blocked[id] ?? []).includes(String(destination)),
  });

  it('offers a destination only where every folder of the drag may go (self, descendants, another dragged folder)', () => {
    const items = [folder('a'), folder('b'), note('n')];
    // `b` may not go into `c` (c is b's descendant) — so `c` is not offered for the whole drag.
    const oracles = wholeDragOracles(items, rules({ b: ['c'], a: ['a'] }));

    expect(oracles.canMoveFolderInto('a', 'x')).toBe(true);
    expect(oracles.canMoveFolderInto('a', 'c')).toBe(false);
    expect(oracles.canMoveFolderInto('a', 'a')).toBe(false);
  });

  it('a note the destination refuses does not invalidate it while another item can still move', () => {
    const oracles = wholeDragOracles([note('n1'), note('n2')], rules({ n1: ['d'] }));
    expect(oracles.canMoveNoteInto('n1', 'd')).toBe(true);

    const none = wholeDragOracles([note('n1'), note('n2')], rules({ n1: ['d'], n2: ['d'] }));
    expect(none.canMoveNoteInto('n1', 'd')).toBe(false);
  });

  it('for a single item it is that item\'s own check', () => {
    expect(wholeDragOracles([folder('a')], rules({ a: ['d'] })).canMoveFolderInto('a', 'd')).toBe(false);
    expect(wholeDragOracles([folder('a')], {}).canMoveFolderInto('a', 'd')).toBe(false); // never guessed
    expect(wholeDragOracles([note('n')], {}).canMoveNoteInto('n', 'd')).toBe(true);
  });
});

describe('placeManyInOrder — the insertion index, with the moved items out of their old places', () => {
  const ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('moves contiguous items up, together and in their own order', () => {
    expect(placeManyInOrder(ORDER, ['d', 'e'], 'b', 'before')).toEqual(['a', 'd', 'e', 'b', 'c', 'f']);
  });

  it('moves contiguous items down: the anchor is found among what is left, not by its old index', () => {
    expect(placeManyInOrder(ORDER, ['b', 'c'], 'e', 'after')).toEqual(['a', 'd', 'e', 'b', 'c', 'f']);
    expect(placeManyInOrder(ORDER, ['b', 'c'], 'e', 'before')).toEqual(['a', 'd', 'b', 'c', 'e', 'f']);
  });

  it('gathers non-contiguous items into one block without separating or reversing them', () => {
    expect(placeManyInOrder(ORDER, ['a', 'c', 'e'], 'f', 'after')).toEqual(['b', 'd', 'f', 'a', 'c', 'e']);
    expect(placeManyInOrder(ORDER, ['a', 'c', 'e'], 'd', 'before')).toEqual(['b', 'a', 'c', 'e', 'd', 'f']);
  });

  it('keeps the order the items already have, whatever order they were named in', () => {
    expect(placeManyInOrder(ORDER, ['e', 'b'], 'a', 'before')).toEqual(['b', 'e', 'a', 'c', 'd', 'f']);
  });

  it('keeps everything not moved in its relative order, at the very start and the very end', () => {
    expect(placeManyInOrder(ORDER, ['c', 'd'], 'a', 'before')).toEqual(['c', 'd', 'a', 'b', 'e', 'f']);
    expect(placeManyInOrder(ORDER, ['c', 'd'], 'f', 'after')).toEqual(['a', 'b', 'e', 'f', 'c', 'd']);
  });

  it('is unchanged for an anchor that is missing or is itself moved', () => {
    expect(placeManyInOrder(ORDER, ['b', 'c'], 'zzz', 'before')).toEqual(ORDER);
    expect(placeManyInOrder(ORDER, ['b', 'c'], 'c', 'after')).toEqual(ORDER);
  });

  it('never loses or duplicates an id', () => {
    const result = placeManyInOrder(ORDER, ['b', 'e', 'stale'], 'd', 'after');
    expect([...result].sort()).toEqual([...ORDER, 'stale'].sort());
    expect(new Set(result).size).toBe(result.length);
  });

  it('does not mutate its input', () => {
    const frozen = Object.freeze([...ORDER]);
    expect(() => placeManyInOrder(frozen, ['b'], 'e', 'after')).not.toThrow();
  });
});
