import { describe, expect, it, vi } from 'vitest';

import { deleteAllArchived, deleteAllFailureMessage, hasArchivedItems } from './deleteAllArchived';
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

    await expect(deleteAllArchived(deps, TRASH)).resolves.toEqual({ total: 0, failed: 0 });

    expect(mocks.resourceOperations.deleteResource).not.toHaveBeenCalled();
    expect(mocks.pageOperations.delete).not.toHaveBeenCalled();
    expect(mocks.folderOperations.delete).not.toHaveBeenCalled();
  });

  it('attempts every item even when one fails, and reports the partial result', async () => {
    const { deps, mocks } = setup({ resources: ['r1'], pages: ['p1'], folders: ['f1'] });
    const boom = new Error('boom');
    mocks.pageOperations.delete.mockRejectedValueOnce(boom);

    const result = await deleteAllArchived(deps, TRASH);

    expect(result).toEqual({ total: 3, failed: 1, firstError: boom });

    expect(mocks.resourceOperations.deleteResource).toHaveBeenCalledWith('r1');
    expect(mocks.folderOperations.delete).toHaveBeenCalledWith('f1');
  });
});

describe('deleteAllFailureMessage', () => {
  it('is null when everything was deleted', () => {
    expect(deleteAllFailureMessage({ total: 3, failed: 0 })).toBeNull();
    expect(deleteAllFailureMessage({ total: 0, failed: 0 })).toBeNull();
  });

  it('says how many were left on a partial failure, and does not claim everything failed', () => {
    expect(deleteAllFailureMessage({ total: 5, failed: 2 })).toBe('Couldn’t delete 2 of 5 items');
  });

  it('names a total failure as such', () => {
    expect(deleteAllFailureMessage({ total: 1, failed: 1 })).toBe('Couldn’t delete this item');
    expect(deleteAllFailureMessage({ total: 4, failed: 4 })).toBe('Couldn’t delete these items');
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
