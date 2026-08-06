import { describe, expect, it } from 'vitest';
import { isFolderUntitled } from './isFolderUntitled';
import type { Folder } from '../vault/models/Folder';

const defaultMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Untitled',
    path: '/vault/Untitled',
    parentId: null,
    metadata: defaultMetadata,
    ...overrides,
  };
}

describe('isFolderUntitled', () => {
  it('is true for a Folder with an auto-generated name', () => {
    expect(isFolderUntitled(makeFolder({ name: 'Untitled 2' }))).toBe(true);
  });

  it('is false for a Folder with a deliberate name', () => {
    expect(isFolderUntitled(makeFolder({ name: 'Projects' }))).toBe(false);
  });
});
