import { describe, expect, it } from 'vitest';
import { FolderBuilder } from './FolderBuilder';
import type { ScannedDirectory } from './VaultScanResult';

function makeScannedDirectory(
  overrides: Partial<ScannedDirectory> = {}
): ScannedDirectory {
  return {
    path: '/vault/Projects',
    parentPath: '/vault',
    frontmatter: null,
    ...overrides,
  };
}

describe('FolderBuilder', () => {
  const builder = new FolderBuilder();

  it('uses the persisted frontmatter id as the stable identity when present', () => {
    const directory = makeScannedDirectory({
      frontmatter: { id: 'persisted-folder-123' },
    });

    const folder = builder.build({ parentId: null, directory });

    expect(folder.id).toBe('persisted-folder-123');
  });

  it('derives identity from the directory path when no frontmatter id exists', () => {
    const directory = makeScannedDirectory({
      path: '/vault/Untitled',
      frontmatter: null,
    });

    const folder = builder.build({ parentId: null, directory });

    expect(folder.id).toBe('/vault/Untitled');
  });

  it('derives the folder name from the path', () => {
    const directory = makeScannedDirectory({ path: '/vault/My Projects' });

    const folder = builder.build({ parentId: null, directory });

    expect(folder.name).toBe('My Projects');
  });

  it('applies documented metadata defaults when frontmatter is absent', () => {
    const directory = makeScannedDirectory({ frontmatter: null });

    const folder = builder.build({ parentId: null, directory });

    expect(folder.metadata).toEqual({
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    });
  });

  it('preserves frontmatter metadata when present', () => {
    const directory = makeScannedDirectory({
      frontmatter: {
        id: 'folder-1',
        icon: '📁',
        favorite: true,
        description: 'Project files',
        cover: 'cover.png',
        status: 'archived',
        archivedAt: '2026-01-01T00:00:00.000Z',
        originalPath: '/vault/OldProjects',
        originalParentId: 'parent-123',
      },
    });

    const folder = builder.build({ parentId: null, directory });

    expect(folder.metadata).toEqual({
      icon: '📁',
      favorite: true,
      description: 'Project files',
      cover: 'cover.png',
      status: 'archived',
      archivedAt: '2026-01-01T00:00:00.000Z',
      originalPath: '/vault/OldProjects',
      originalParentId: 'parent-123',
    });
  });

  it('assigns the given parentId verbatim', () => {
    const directory = makeScannedDirectory();

    const folder = builder.build({ parentId: 'parent-folder', directory });

    expect(folder.parentId).toBe('parent-folder');
  });
});
