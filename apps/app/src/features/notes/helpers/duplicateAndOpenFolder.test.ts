import { describe, expect, it, vi } from 'vitest';
import { duplicateAndOpenFolder } from './duplicateAndOpenFolder';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

describe('duplicateAndOpenFolder', () => {
  it('duplicates the folder, then opens the resulting duplicate', async () => {
    const duplicate = vi.fn().mockResolvedValue('folder-copy');
    const open = vi.fn().mockResolvedValue(undefined);
    const folderOperations = { duplicate, open } as unknown as FolderOperations;

    await duplicateAndOpenFolder(folderOperations, 'folder-1');

    expect(duplicate).toHaveBeenCalledWith('folder-1');
    expect(open).toHaveBeenCalledWith('folder-copy');
    // open() is called with the *duplicate's* id, never the source's.
    expect(open).not.toHaveBeenCalledWith('folder-1');
  });

  it('opens only after duplicate() resolves, using its returned id', async () => {
    const callOrder: string[] = [];
    const duplicate = vi.fn().mockImplementation(async () => {
      callOrder.push('duplicate');
      return 'folder-copy';
    });
    const open = vi.fn().mockImplementation(async () => {
      callOrder.push('open');
    });
    const folderOperations = { duplicate, open } as unknown as FolderOperations;

    await duplicateAndOpenFolder(folderOperations, 'folder-1');

    expect(callOrder).toEqual(['duplicate', 'open']);
  });
});
