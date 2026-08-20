import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  // Regression test for the "test" / "Test" / "Test 2" ghost-duplicate bug:
  // macOS (APFS) and Windows (NTFS) are case-insensitive-but-case-preserving
  // on disk — "test" and "Test" are the same directory — but this resolver's
  // isTaken check used to be a case-sensitive vault.getFolderByPath lookup,
  // so a differently-cased name sailed past it as "free." The real mkdir
  // for that "free" candidate would then silently no-op against the
  // existing directory (see LocalFileSystem.createDirectory /
  // InMemoryVaultFileSystem's mirrored behavior), and the Gate's own
  // .folder.md write would corrupt the pre-existing folder's metadata,
  // while Vault ended up with two separate in-memory records for one
  // physical directory.
  it('treats a case-variant of an existing name as a collision, picking the next free numbered name instead', () => {
    const existing = makeFolder('folder-1', `${ROOT}/test`);
    const vault = makeVault([existing]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.createFolderPath(null, 'Test');

    expect(result).toEqual({ path: `${ROOT}/Test 2`, parentId: null });
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

  describe('collision fallback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 12, 16, 43, 1)); // local time, 2026-08-12 16:43:01
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('falls back to a local-time timestamp suffix when Archive/<name> is already taken by a different folder', () => {
      const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
      // Already occupies the flattened destination — a different folder
      // (e.g. an earlier archive of some other `Project/`).
      const alreadyArchived = makeFolder('folder-archived', `${ROOT}/Archive/Project`, 'folder-archive');
      const folder = makeFolder('folder-1', `${ROOT}/OldProject/Project`);
      const vault = makeVault([archive, alreadyArchived, folder]);
      const resolver = new FolderPathResolver(vault);

      const result = resolver.resolveArchiveDestination('folder-1');

      expect(result).toEqual({
        path: `${ROOT}/Archive/Project 2026-08-12 16.43.01`,
        parentId: 'folder-archive',
      });
    });

    it('falls back to a deterministic .01 suffix when even the timestamped name is taken', () => {
      const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
      const alreadyArchived = makeFolder('folder-archived', `${ROOT}/Archive/Project`, 'folder-archive');
      const alreadyTimestamped = makeFolder(
        'folder-archived-2',
        `${ROOT}/Archive/Project 2026-08-12 16.43.01`,
        'folder-archive'
      );
      const folder = makeFolder('folder-1', `${ROOT}/OldProject/Project`);
      const vault = makeVault([archive, alreadyArchived, alreadyTimestamped, folder]);
      const resolver = new FolderPathResolver(vault);

      const result = resolver.resolveArchiveDestination('folder-1');

      expect(result).toEqual({
        path: `${ROOT}/Archive/Project 2026-08-12 16.43.01.01`,
        parentId: 'folder-archive',
      });
    });
  });
});

describe('FolderPathResolver.resolveMoveDestination — same-parent (rename)', () => {
  it('resolves a new path under the same parent', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', null, 'Renamed');

    expect(result).toEqual({ path: `${ROOT}/Renamed`, parentId: null });
  });

  it('resolving to the current name is a no-op, not a self-collision', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', null, 'Projects');

    expect(result.path).toBe(`${ROOT}/Projects`);
  });

  it('regenerates a fresh default name for a blank or whitespace-only name, never keeping the old name', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    expect(resolver.resolveMoveDestination('folder-1', null, '')).toEqual({
      path: `${ROOT}/Untitled`,
      parentId: null,
    });
    expect(resolver.resolveMoveDestination('folder-1', null, '   ')).toEqual({
      path: `${ROOT}/Untitled`,
      parentId: null,
    });
  });

  it('appends a numeric suffix when the generated default collides with a sibling folder', () => {
    const renaming = makeFolder('folder-1', `${ROOT}/Projects`);
    const occupant = makeFolder('folder-2', `${ROOT}/Untitled`);
    const vault = makeVault([renaming, occupant]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', null, '');

    expect(result.path).toBe(`${ROOT}/Untitled 2`);
  });

  it('throws for an unknown folderId', () => {
    const vault = makeVault();
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveMoveDestination('does-not-exist', null, 'Renamed')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  // Regression tests: macOS/Windows are case-insensitive on disk, but this
  // resolver's collision check used to be case-sensitive — see
  // FolderPathResolver.createFolderPath's identical regression test above
  // for the full mechanism.
  it('appends a numeric suffix when the new name is a case-variant of a different, existing sibling folder', () => {
    const renaming = makeFolder('folder-1', `${ROOT}/Projects`);
    const sibling = makeFolder('folder-2', `${ROOT}/test`);
    const vault = makeVault([renaming, sibling]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', null, 'Test');

    expect(result.path).toBe(`${ROOT}/Test 2`);
  });

  it('renaming to a case-variant of its own current name is a pure case change, not a self-collision', () => {
    const folder = makeFolder('folder-1', `${ROOT}/test`);
    const vault = makeVault([folder]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', null, 'Test');

    expect(result.path).toBe(`${ROOT}/Test`);
  });
});

describe('FolderPathResolver.resolveMoveDestination — reparenting (move)', () => {
  it('reparents into an arbitrary destination folder, preserving the folder name by default', () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const destination = makeFolder('folder-2', `${ROOT}/Archive-Not`);
    const vault = makeVault([source, destination]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', 'folder-2');

    expect(result).toEqual({ path: `${ROOT}/Archive-Not/Projects`, parentId: 'folder-2' });
  });

  it('resolves to the vault root when destinationFolderId is null', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const source = makeFolder('folder-1', `${ROOT}/Parent/Projects`, 'folder-parent');
    const vault = makeVault([parent, source]);
    const resolver = new FolderPathResolver(vault);

    const result = resolver.resolveMoveDestination('folder-1', null);

    expect(result).toEqual({ path: `${ROOT}/Projects`, parentId: null });
  });

  it('throws for an unknown destinationFolderId', () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([source]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveMoveDestination('folder-1', 'does-not-exist')).toThrow(
      /Folder not found: does-not-exist/
    );
  });

  it('rejects moving a folder into itself', () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([source]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveMoveDestination('folder-1', 'folder-1')).toThrow(
      /Cannot move folder into itself or a descendant/
    );
  });

  it('rejects moving a folder into its own descendant', () => {
    const parent = makeFolder('folder-1', `${ROOT}/Projects`);
    const child = makeFolder('folder-2', `${ROOT}/Projects/Sub`, 'folder-1');
    const vault = makeVault([parent, child]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveMoveDestination('folder-1', 'folder-2')).toThrow(
      /Cannot move folder into itself or a descendant/
    );
  });

  it('rejects a destination inside the reserved Daily Notes folder', () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const nested = makeFolder('folder-nested', `${ROOT}/Daily Notes/2026`, 'folder-daily-notes');
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([dailyNotes, nested, source]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveMoveDestination('folder-1', 'folder-nested')).toThrow(
      /Cannot move into Daily Notes/
    );
  });

  it('rejects the reserved Daily Notes folder itself as a destination', () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const vault = makeVault([dailyNotes, source]);
    const resolver = new FolderPathResolver(vault);

    expect(() => resolver.resolveMoveDestination('folder-1', 'folder-daily-notes')).toThrow(
      /Cannot move into Daily Notes/
    );
  });
});
