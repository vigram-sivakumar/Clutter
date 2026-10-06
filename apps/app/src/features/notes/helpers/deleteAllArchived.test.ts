import { describe, expect, it, vi } from 'vitest';

import { deleteAllArchived, hasArchivedItems } from './deleteAllArchived';
import type { DeleteAllArchivedDeps } from './deleteAllArchived';

const TRASH = 'archive-folder';

function setup(
  contents: { resources?: string[]; pages?: string[]; folders?: string[] } = {}
) {
  const calls: string[] = [];
  const deps = {
    membershipSelector: {
      getArchivedResources: () => (contents.resources ?? []).map((id) => ({ id })),
      getVisibleChildPages: (parent: string) =>
        parent === TRASH ? (contents.pages ?? []).map((id) => ({ id })) : [],
      getVisibleChildFolders: (parent: string) =>
        parent === TRASH ? (contents.folders ?? []).map((id) => ({ id })) : [],
    },
    resourceOperations: {
      deleteResource: vi.fn(async (id: string) => void calls.push(`resource:${id}`)),
    },
    pageOperations: {
      delete: vi.fn(async (id: string) => void calls.push(`page:${id}`)),
    },
    folderOperations: {
      delete: vi.fn(async (id: string) => void calls.push(`folder:${id}`)),
    },
  };

  return { deps: deps as unknown as DeleteAllArchivedDeps, mocks: deps, calls };
}

describe('deleteAllArchived', () => {
  it('permanently deletes every file, note and folder, files first', async () => {
    const { deps, calls } = setup({ resources: ['r1', 'r2'], pages: ['p1'], folders: ['f1'] });

    await deleteAllArchived(deps, TRASH);

    expect(calls).toEqual(['resource:r1', 'resource:r2', 'page:p1', 'folder:f1']);
  });

  it('is a no-op for an already-empty Trash', async () => {
    const { deps, mocks } = setup();

    await expect(deleteAllArchived(deps, TRASH)).resolves.toBeUndefined();

    expect(mocks.resourceOperations.deleteResource).not.toHaveBeenCalled();
    expect(mocks.pageOperations.delete).not.toHaveBeenCalled();
    expect(mocks.folderOperations.delete).not.toHaveBeenCalled();
  });

  it('attempts every item even when one fails, then rethrows the first failure', async () => {
    const { deps, mocks } = setup({ resources: ['r1'], pages: ['p1'], folders: ['f1'] });
    mocks.pageOperations.delete.mockRejectedValueOnce(new Error('boom'));

    await expect(deleteAllArchived(deps, TRASH)).rejects.toThrow('boom');

    expect(mocks.resourceOperations.deleteResource).toHaveBeenCalledWith('r1');
    expect(mocks.folderOperations.delete).toHaveBeenCalledWith('f1');
  });
});

describe('hasArchivedItems', () => {
  it('is false when nothing is archived and true for any kind of item', () => {
    expect(hasArchivedItems(setup().deps, TRASH)).toBe(false);
    expect(hasArchivedItems(setup({ resources: ['r'] }).deps, TRASH)).toBe(true);
    expect(hasArchivedItems(setup({ pages: ['p'] }).deps, TRASH)).toBe(true);
    expect(hasArchivedItems(setup({ folders: ['f'] }).deps, TRASH)).toBe(true);
  });
});
