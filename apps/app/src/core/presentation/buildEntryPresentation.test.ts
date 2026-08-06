import { describe, expect, it } from 'vitest';
import { buildEntryPresentation } from './buildEntryPresentation';
import type { Folder } from '@core/vault/models/Folder';

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

describe('buildEntryPresentation (folder)', () => {
  it('shows the deliberate folder name with default styling', () => {
    const result = buildEntryPresentation(makeFolder({ name: 'Projects' }));

    expect(result.title).toBe('Projects');
    expect(result.titleStyle).toBe('default');
  });

  it('shows the placeholder with placeholder styling for a generated folder name', () => {
    const result = buildEntryPresentation(makeFolder({ name: 'Untitled 2' }));

    expect(result.title).toBe('New Folder');
    expect(result.titleStyle).toBe('placeholder');
  });
});
