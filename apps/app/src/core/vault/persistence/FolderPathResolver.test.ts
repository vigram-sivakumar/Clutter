import { describe, expect, it } from 'vitest';
import { FolderPathResolver } from './FolderPathResolver';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makeVault(folders: Folder[] = []): Vault {
  return new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('FolderPathResolver.createFolderPath', () => {
  it('resolves a folder at the vault root when parentId is null', () => {
    const vault = makeVault();
    const resolver = new FolderPathResolver(vault);

    const result = resolver.createFolderPath(null, 'Projects');

    expect(result).toEqual({ path: `${ROOT}/Projects`, parentId: null });
  });

  it('resolves a folder nested inside a named parent folder', () => {
    const parent = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([parent]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.createFolderPath('folder-1', 'Q1');

    expect(result).toEqual({ path: `${ROOT}/Projects/Q1`, parentId: 'folder-1' });
  });

  it('throws for an unknown parentId', () => {
    const vault = makeVault();
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.createFolderPath('does-not-exist', 'Q1')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  it('falls back to "Untitled Folder" for a blank or whitespace-only name', () => {
    const vault = makeVault();
    const resolver = new FolderPathResolver(vault);

    expect(resolver.createFolderPath(null, '')).toEqual({
      path: `${ROOT}/Untitled Folder`,
      parentId: null,
    });
    expect(resolver.createFolderPath(null, '   ')).toEqual({
      path: `${ROOT}/Untitled Folder`,
      parentId: null,
    });
  });

  it('picks the next free numbered name when one collision exists', () => {
    const existing = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([existing]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.createFolderPath(null, 'Projects');

    expect(result).toEqual({ path: `${ROOT}/Projects 2`, parentId: null });
  });

  it('picks the next free numbered name when multiple collisions exist', () => {
    const existing = [
      makeFolder('folder-1', `${ROOT}/Projects`),
      makeFolder('folder-2', `${ROOT}/Projects 2`),
      makeFolder('folder-3', `${ROOT}/Projects 3`),
    ];
    const vault = makeVault(existing);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.createFolderPath(null, 'Projects');

    expect(result).toEqual({ path: `${ROOT}/Projects 4`, parentId: null });
  });
});
