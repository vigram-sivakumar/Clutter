import { describe, expect, it, vi } from 'vitest';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import { moveToTemplatesFolder } from './moveToTemplatesFolder';

describe('moveToTemplatesFolder', () => {
  it('ensures the Templates folder, then moves the page into it', async () => {
    const calls: string[] = [];
    const ensureReservedFolder = vi.fn(async () => {
      calls.push('ensure');
      return { id: 'templates-folder' };
    });
    const move = vi.fn(async () => {
      calls.push('move');
    });

    await moveToTemplatesFolder(
      { ensureReservedFolder } as unknown as FolderOperations,
      { move } as unknown as PageOperations,
      'page-1'
    );

    expect(ensureReservedFolder).toHaveBeenCalledWith('templates');
    expect(move).toHaveBeenCalledWith('page-1', 'templates-folder');
    expect(calls).toEqual(['ensure', 'move']);
  });

  it('does not move when ensuring the folder fails', async () => {
    const move = vi.fn();

    await expect(
      moveToTemplatesFolder(
        { ensureReservedFolder: vi.fn().mockRejectedValue(new Error('nope')) } as unknown as FolderOperations,
        { move } as unknown as PageOperations,
        'page-1'
      )
    ).rejects.toThrow('nope');
    expect(move).not.toHaveBeenCalled();
  });
});
