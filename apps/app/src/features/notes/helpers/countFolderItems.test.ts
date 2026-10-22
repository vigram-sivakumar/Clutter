import { describe, expect, it, vi } from 'vitest';

import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

import { countFolderItems } from './countFolderItems';

function selector(folders: number, notes: number): MembershipSelector {
  return {
    getVisibleChildFolders: vi.fn(() => new Array(folders).fill({})),
    getNotesChildPages: vi.fn(() => new Array(notes).fill({})),
    getVisibleChildResources: vi.fn(() => new Array(9).fill({})),
  } as unknown as MembershipSelector;
}

describe('countFolderItems', () => {
  it('is the subfolders plus the notes of that folder', () => {
    const membership = selector(2, 3);

    expect(countFolderItems(membership, 'f1')).toBe(5);
    expect(membership.getVisibleChildFolders).toHaveBeenCalledWith('f1');
    expect(membership.getNotesChildPages).toHaveBeenCalledWith('f1');
  });

  it('never counts assets, even when the folder holds some', () => {
    const membership = selector(0, 1);

    expect(countFolderItems(membership, 'f1')).toBe(1);
    expect(membership.getVisibleChildResources).not.toHaveBeenCalled();
  });

  it('is zero for an empty folder', () => {
    expect(countFolderItems(selector(0, 0), 'f1')).toBe(0);
  });
});
