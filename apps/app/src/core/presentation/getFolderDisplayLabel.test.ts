import { describe, expect, it } from 'vitest';
import { getFolderDisplayLabel } from './getFolderDisplayLabel';
import { getPageDisplayLabelStyle } from './getPageDisplayLabel';
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

describe('getFolderDisplayLabel', () => {
  it('shows the deliberate name when the folder has one', () => {
    const label = getFolderDisplayLabel(makeFolder({ name: 'Projects' }));

    expect(label).toEqual({ text: 'Projects', source: 'title' });
    expect(getPageDisplayLabelStyle(label)).toBe('default');
  });

  it('shows the placeholder when the folder name is still generated', () => {
    const label = getFolderDisplayLabel(makeFolder({ name: 'Untitled 2' }));

    expect(label).toEqual({ text: 'New Folder', source: 'placeholder' });
    expect(getPageDisplayLabelStyle(label)).toBe('placeholder');
  });
});
