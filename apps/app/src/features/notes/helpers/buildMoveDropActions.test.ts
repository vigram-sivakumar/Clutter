import { describe, expect, it, vi } from 'vitest';
import type { ToastApi } from '@components/toast/ToastProvider';
import { buildNoteFolderMoveActions } from './buildMoveDropActions';

function setup(withOrdering = true) {
  const moveNote = vi.fn(async () => undefined);
  const moveFolder = vi.fn(async () => undefined);
  const left = vi.fn();
  const fail = vi.fn(() => null);
  const toast: ToastApi = { show: () => 1, fail, dismiss: () => {} };
  const deps = {
    vault: {
      getPage: vi.fn(() => ({ parentId: 'old' })),
      getFolder: vi.fn(() => ({ parentId: 'old' })),
    },
    pageOperations: { move: moveNote },
    folderOperations: { move: moveFolder },
  } as unknown as Parameters<typeof buildNoteFolderMoveActions>[0];
  return { actions: buildNoteFolderMoveActions(deps, toast, withOrdering ? left : undefined), moveNote, moveFolder, left, fail };
}

describe('shared note and folder move orchestration', () => {
  it('forgets the old position only after a successful cross-parent note move', async () => {
    const { actions, moveNote, moveFolder, left } = setup();
    let finish!: () => void;
    moveNote.mockImplementationOnce(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }));
    const pending = actions.onMoveNote('note', 'new');
    expect(moveNote).toHaveBeenCalledWith('note', 'new');
    expect(moveFolder).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(left).toHaveBeenCalledWith('old', 'note', 'note');
  });

  it('preserves ordering for a same-parent folder move', async () => {
    const { actions, moveFolder, left } = setup();
    await actions.onMoveFolder('folder', 'old');
    expect(moveFolder).toHaveBeenCalledWith('folder', 'old');
    expect(left).not.toHaveBeenCalled();
  });

  it('reports a failed move and rethrows without clearing the previous position', async () => {
    const { actions, moveFolder, fail, left } = setup();
    const error = new Error('refused');
    moveFolder.mockRejectedValueOnce(error);
    await expect(actions.onMoveFolder('folder', 'new')).rejects.toBe(error);
    expect(fail).toHaveBeenCalledWith('Couldn’t move this folder', error);
    expect(left).not.toHaveBeenCalled();
  });

  it('keeps a failed batch move silent but still rejects', async () => {
    const { actions, moveNote, fail, left } = setup();
    const error = new Error('refused');
    moveNote.mockRejectedValueOnce(error);
    await expect(actions.onMoveNote('note', 'new', { silent: true })).rejects.toBe(error);
    expect(fail).not.toHaveBeenCalled();
    expect(left).not.toHaveBeenCalled();
  });

  it('supports menu callers that do not own manual order', async () => {
    const { actions, moveFolder, left } = setup(false);
    await actions.onMoveFolder('folder', null);
    expect(moveFolder).toHaveBeenCalledWith('folder', null);
    expect(left).not.toHaveBeenCalled();
  });
});
