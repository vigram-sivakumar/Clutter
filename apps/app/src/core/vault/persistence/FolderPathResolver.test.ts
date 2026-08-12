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

  it('falls back to the generated default name for a blank or whitespace-only name', () => {
    const vault = makeVault();
    const resolver = new FolderPathResolver(vault);

    expect(resolver.createFolderPath(null, '')).toEqual({
      path: `${ROOT}/Untitled`,
      parentId: null,
    });
    expect(resolver.createFolderPath(null, '   ')).toEqual({
      path: `${ROOT}/Untitled`,
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

describe('FolderPathResolver.resolveArchiveDestination (ADR-026)', () => {
  it('resolves the folder into the reserved Archive folder, keeping its own basename', () => {
    const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([archive, folder]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveArchiveDestination('folder-1');

    expect(result).toEqual({ path: `${ROOT}/Archive/Projects`, parentId: 'folder-archive' });
  });

  it('throws for an unknown folderId', () => {
    const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
    const vault = makeVault([archive]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveArchiveDestination('does-not-exist')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  it('throws when the vault has no reserved Archive folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveArchiveDestination('folder-1')).toThrow(
      /Archive folder not found/
    );
  });
});

describe('FolderPathResolver.resolveRenamePath', () => {
  it('resolves a new path under the same parent', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveRenamePath('folder-1', 'Renamed');

    expect(result).toEqual({ path: `${ROOT}/Renamed`, parentId: null });
  });

  it('resolving to the current name is a no-op, not a self-collision', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveRenamePath('folder-1', 'Projects');

    expect(result.path).toBe(`${ROOT}/Projects`);
  });

  it('regenerates a fresh default name for a blank or whitespace-only name, never keeping the old name', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    expect(resolver.resolveRenamePath('folder-1', '')).toEqual({
      path: `${ROOT}/Untitled`,
      parentId: null,
    });
    expect(resolver.resolveRenamePath('folder-1', '   ')).toEqual({
      path: `${ROOT}/Untitled`,
      parentId: null,
    });
  });

  it('appends a numeric suffix when the generated default collides with a sibling folder', () => {
    const renaming = makeFolder('folder-1', `${ROOT}/Projects`);
    const occupant = makeFolder('folder-2', `${ROOT}/Untitled`);
    const vault = makeVault([renaming, occupant]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveRenamePath('folder-1', '');

    expect(result.path).toBe(`${ROOT}/Untitled 2`);
  });

  it('throws for an unknown folderId', () => {
    const vault = makeVault();
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveRenamePath('does-not-exist', 'Renamed')).toThrow(
      /Folder not found: does-not-exist/
    );
  });
});
