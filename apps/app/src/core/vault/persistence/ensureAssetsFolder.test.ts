import { describe, expect, it } from 'vitest';
import { ensureAssetsFolder } from './ensureAssetsFolder';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import type { Folder } from '../models/Folder';

const ROOT = '/vault';

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

function makeAssetsFolder(): Folder {
  return {
    id: 'folder-assets',
    name: 'Assets',
    path: `${ROOT}/Assets`,
    parentId: null,
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

describe('ensureAssetsFolder', () => {
  it('creates Assets/ on disk when it does not exist at all', async () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();

    await ensureAssetsFolder(vault, fileSystem);

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(true);
  });

  it('registers a Folder in Vault when Assets/ did not exist at all', async () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();

    const folder = await ensureAssetsFolder(vault, fileSystem);

    expect(folder.path).toBe(`${ROOT}/Assets`);
    expect(folder.name).toBe('Assets');
    expect(folder.parentId).toBeNull();
    expect(vault.getFolderByPath(`${ROOT}/Assets`)).toBe(folder);
  });

  it('registers a Folder in Vault when Assets/ exists on disk but was never scanned/tracked', async () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);

    const folder = await ensureAssetsFolder(vault, fileSystem);

    expect(folder.path).toBe(`${ROOT}/Assets`);
    expect(vault.getFolderByPath(`${ROOT}/Assets`)).toBe(folder);
  });

  it('reuses the already-tracked Folder when Assets/ is already registered in Vault', async () => {
    const existing = makeAssetsFolder();
    const vault = makeVault([existing]);
    const fileSystem = new InMemoryVaultFileSystem();

    const folder = await ensureAssetsFolder(vault, fileSystem);

    expect(folder).toBe(existing);
    expect(folder.id).toBe('folder-assets');
  });

  it('is idempotent — repeated calls return the same tracked Folder, no duplicate registration', async () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();

    const first = await ensureAssetsFolder(vault, fileSystem);
    const second = await ensureAssetsFolder(vault, fileSystem);
    const third = await ensureAssetsFolder(vault, fileSystem);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(vault.folderCount).toBe(1);
  });
});
