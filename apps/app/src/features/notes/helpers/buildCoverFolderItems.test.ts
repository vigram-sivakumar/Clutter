import { describe, expect, it } from 'vitest';

import type { Folder } from '@core/vault/models/Folder';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { buildCoverFolderItems } from './buildCoverFolderItems';

const folder = (id: string, name: string, parentId: string | null, icon: string | null = null) =>
  ({ id, name, parentId, metadata: { icon } }) as unknown as Folder;

const FOLDERS = [
  folder('projects', 'Projects', null),
  folder('a', 'Project A', 'projects'),
  folder('journal', 'journal', null, '📓'),
  folder('archive-me', 'Alpha', null),
];

const selector = {
  vaultRoot: '/vault',
  getWorkspaceFolders: () => FOLDERS.filter((f) => f.parentId === null),
  getVisibleChildFolders: (id: string) => FOLDERS.filter((f) => f.parentId === id),
} as unknown as MembershipSelector;

describe('buildCoverFolderItems', () => {
  it('lists every folder as one flat, alphabetical Folders section, without the vault root', () => {
    const items = buildCoverFolderItems(selector);

    expect(items.map((item) => item.title)).toEqual(['Alpha', 'journal', 'Project A', 'Projects']);
    expect(items.every((item) => item.section === 'Folders' && item.level === 0 && item.parentId === null)).toBe(true);
    expect(items.every((item) => item.icon === 'folder')).toBe(true);
  });

  it('keeps a nested folder\'s parent chain as its path and a folder\'s own emoji', () => {
    const items = buildCoverFolderItems(selector);

    expect(items.find((item) => item.id === 'a')!.ancestors).toEqual([{ id: 'projects', title: 'Projects', emoji: null }]);
    expect(items.find((item) => item.id === 'journal')!.emoji).toBe('📓');
    expect(items.find((item) => item.id === 'projects')!.ancestors).toBeUndefined();
  });
});
