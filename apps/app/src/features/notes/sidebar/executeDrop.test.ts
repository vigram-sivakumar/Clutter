import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeDrop, type DropActions } from './executeDrop';
import type { DropTarget } from './dropTarget';

const NOTE = { kind: 'note', id: 'n1', parentId: 'src' } as const;
const FOLDER = { kind: 'folder', id: 'f1', parentId: 'src' } as const;
const inside: DropTarget = { kind: 'inside', folderId: 'dest', rect: { top: 0, left: 0, width: 1, height: 1 } };

function actions(overrides: Partial<DropActions> = {}) {
  const spies = {
    onMoveNote: vi.fn(async () => {}),
    onMoveFolder: vi.fn(async () => {}),
    canMoveFolderInto: vi.fn(() => true),
    placeSibling: vi.fn(),
  };
  return { spies, actions: { ...spies, ...overrides } as DropActions };
}

afterEach(() => vi.restoreAllMocks());

describe('executeDrop', () => {
  it('moves a note into the folder shown, through the Move handler, once', async () => {
    const { spies, actions: a } = actions();
    expect(await executeDrop(NOTE, inside, a)).toBe('moved');
    expect(spies.onMoveNote).toHaveBeenCalledExactlyOnceWith('n1', 'dest');
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('moves a folder after re-checking the move rules for that exact pair', async () => {
    const { spies, actions: a } = actions();
    expect(await executeDrop(FOLDER, inside, a)).toBe('moved');
    expect(spies.canMoveFolderInto).toHaveBeenCalledExactlyOnceWith('f1', 'dest');
    expect(spies.onMoveFolder).toHaveBeenCalledExactlyOnceWith('f1', 'dest');
    expect(spies.onMoveNote).not.toHaveBeenCalled();
  });

  it('rejects a folder move the rules no longer allow, without calling the move', async () => {
    const { spies, actions: a } = actions({ canMoveFolderInto: () => false });
    expect(await executeDrop(FOLDER, inside, a)).toBe('rejected');
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('never guesses the rules: no rule check available means no folder move', async () => {
    const { spies, actions: a } = actions({ canMoveFolderInto: undefined });
    expect(await executeDrop(FOLDER, inside, a)).toBe('rejected');
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('does nothing for no target', async () => {
    const { spies, actions: a } = actions();
    expect(await executeDrop(NOTE, null, a)).toBe('ignored');
    expect(await executeDrop(FOLDER, null, a)).toBe('ignored');
    expect(spies.onMoveNote).not.toHaveBeenCalled();
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
    expect(spies.placeSibling).not.toHaveBeenCalled();
  });

  it('does nothing without row actions', async () => {
    expect(await executeDrop(NOTE, inside, undefined)).toBe('ignored');
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('Cannot move'))],
    [
      'throws',
      () => {
        throw new Error('Cannot move');
      },
    ],
  ])('a move that %s is reported as rejected and never escapes', async (_name, fail) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { actions: a } = actions({ onMoveNote: fail, onMoveFolder: fail });
    expect(await executeDrop(NOTE, inside, a)).toBe('rejected');
    expect(await executeDrop(FOLDER, inside, a)).toBe('rejected');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('executeDrop — insertion positions (manual order)', () => {
  const sameParent: DropTarget = { kind: 'insert', parentId: 'src', edge: 'after', rowId: 'x', rowKind: 'note', line: { y: 0, left: 0, width: 1 } };
  const otherParent: DropTarget = { kind: 'insert', parentId: 'dest', edge: 'before', rowId: 'x', rowKind: 'note', line: { y: 0, left: 0, width: 1 } };
  const rootPosition: DropTarget = { kind: 'insert', parentId: null, edge: 'before', rowId: 'x', rowKind: 'note', line: { y: 0, left: 0, width: 1 } };

  it('within the same parent it only places the item — nothing is moved', async () => {
    const { spies, actions: a } = actions();
    expect(await executeDrop(NOTE, sameParent, a)).toBe('reordered');
    expect(await executeDrop(FOLDER, sameParent, a)).toBe('reordered');
    expect(spies.placeSibling).toHaveBeenNthCalledWith(1, NOTE, 'src', { kind: 'note', id: 'x' }, 'after');
    expect(spies.placeSibling).toHaveBeenNthCalledWith(2, FOLDER, 'src', { kind: 'note', id: 'x' }, 'after');
    expect(spies.onMoveNote).not.toHaveBeenCalled();
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('from another parent it moves with the existing Move first, then places the item', async () => {
    const calls: string[] = [];
    const { spies, actions: a } = actions({
      onMoveNote: async () => void calls.push('move'),
      placeSibling: () => void calls.push('place'),
    });
    expect(await executeDrop(NOTE, otherParent, a)).toBe('moved');
    expect(calls).toEqual(['move', 'place']);
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
  });

  it('a folder from another parent is re-checked against the move rules, moved, then placed', async () => {
    const { spies, actions: a } = actions();
    expect(await executeDrop(FOLDER, otherParent, a)).toBe('moved');
    expect(spies.canMoveFolderInto).toHaveBeenCalledWith('f1', 'dest');
    expect(spies.onMoveFolder).toHaveBeenCalledWith('f1', 'dest');
    expect(spies.placeSibling).toHaveBeenCalledExactlyOnceWith(FOLDER, 'dest', { kind: 'note', id: 'x' }, 'before');
  });

  it('a failed move writes no ordering at all', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spies, actions: a } = actions({ onMoveNote: async () => Promise.reject(new Error('no')) });
    expect(await executeDrop(NOTE, otherParent, a)).toBe('rejected');
    expect(spies.placeSibling).not.toHaveBeenCalled();
  });

  it('a folder the move rules refuse is neither moved nor placed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spies, actions: a } = actions({ canMoveFolderInto: () => false });
    expect(await executeDrop(FOLDER, otherParent, a)).toBe('rejected');
    expect(spies.onMoveFolder).not.toHaveBeenCalled();
    expect(spies.placeSibling).not.toHaveBeenCalled();
  });

  it('a note is never placed in the root list; a folder can be', async () => {
    const { spies, actions: a } = actions();
    expect(await executeDrop(NOTE, rootPosition, a)).toBe('ignored');
    expect(spies.onMoveNote).not.toHaveBeenCalled();
    expect(await executeDrop(FOLDER, rootPosition, a)).toBe('moved');
    expect(spies.onMoveFolder).toHaveBeenCalledWith('f1', null);
    expect(spies.placeSibling).toHaveBeenCalledExactlyOnceWith(FOLDER, null, { kind: 'note', id: 'x' }, 'before');
  });

  it('without a way to place siblings an insertion position does nothing', async () => {
    const { spies, actions: a } = actions({ placeSibling: undefined });
    expect(await executeDrop(NOTE, sameParent, a)).toBe('ignored');
    expect(spies.onMoveNote).not.toHaveBeenCalled();
  });
});
