import { describe, expect, it } from 'vitest';
import { resolveResourceRestoreDestination } from './resolveResourceRestoreDestination';
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import type { Folder } from '../models/Folder';
import type { VaultResource } from '../models/VaultResource';

const ROOT = '/vault';

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
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

function makeResource(id: string, path: string, parentId: string | null = null): VaultResource {
  return {
    id,
    kind: 'image',
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
  };
}

function makeVault(folders: Folder[] = [], resources: VaultResource[] = []): Vault {
  return new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

describe('resolveResourceRestoreDestination', () => {
  it('Case A: restores to the original path when the archive record exists and the original parent folder still exists', async () => {
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, 'folder-archive');
    const vault = makeVault([websiteFolder, archiveFolder], [resource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    await store.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(destination).toEqual({
      path: `${ROOT}/Projects/Website/hero.png`,
      parentId: 'folder-website',
    });
  });

  it('Case A: restores to the vault root when the original path was directly under the root', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, 'folder-archive');
    const vault = makeVault([archiveFolder], [resource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    await store.record(`${ROOT}/Archive/hero.png`, `${ROOT}/hero.png`);

    const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(destination).toEqual({ path: `${ROOT}/hero.png`, parentId: null });
  });

  it('does not create Assets/ when Case A resolves — no unnecessary side effect', async () => {
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const vault = makeVault([websiteFolder], [resource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    await store.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(false);
  });

  it('Case B: falls back to Assets/ (not the vault root) when the original parent folder no longer exists', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const vault = makeVault([], [resource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    await store.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(destination.path).toBe(`${ROOT}/Assets/hero.png`);
    expect(vault.getFolderByPath(`${ROOT}/Assets`)).toBeDefined();
    expect(destination.parentId).toBe(vault.getFolderByPath(`${ROOT}/Assets`)!.id);
  });

  it('Case C: falls back to Assets/ when no archive record exists at all', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const vault = makeVault([], [resource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    // No store.record() call — the file doesn't exist at all.

    const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(destination.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  it('the Assets/ fallback reuses an already-tracked Assets Folder rather than creating a second one', async () => {
    const assetsFolder = makeFolder('folder-assets', `${ROOT}/Assets`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const vault = makeVault([assetsFolder], [resource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);

    const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(destination).toEqual({ path: `${ROOT}/Assets/hero.png`, parentId: 'folder-assets' });
  });

  it('resolves the archive record by the resource\'s current (archived) path, not by id', async () => {
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const otherResource = makeResource('resource-2', `${ROOT}/Archive/other.png`);
    const vault = makeVault([websiteFolder], [resource, otherResource]);
    const fileSystem = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    await store.record(`${ROOT}/Archive/other.png`, `${ROOT}/Projects/Website/other.png`);
    // No record for hero.png specifically — must not accidentally match otherResource's record.

    const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

    expect(destination.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  describe('restore collision — fails loudly, does not overwrite or auto-rename', () => {
    it('throws when the resolved original-path destination is already occupied by another resource', async () => {
      const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
      const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
      const occupant = makeResource(
        'resource-occupant',
        `${ROOT}/Projects/Website/hero.png`,
        'folder-website'
      );
      const vault = makeVault([websiteFolder], [resource, occupant]);
      const fileSystem = new InMemoryVaultFileSystem();
      const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
      await store.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

      const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

      expect(() => {
        vault.updateResourcePath(resource.id, destination.path, destination.parentId);
      }).toThrow(`Path already in use by another resource: ${ROOT}/Projects/Website/hero.png`);
    });

    it('throws when the resolved Assets/ fallback destination is already occupied by another resource', async () => {
      const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
      const occupant = makeResource('resource-occupant', `${ROOT}/Assets/hero.png`);
      const vault = makeVault([], [resource, occupant]);
      const fileSystem = new InMemoryVaultFileSystem();
      const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
      // No record — falls back to Assets/, which is already occupied.

      const destination = await resolveResourceRestoreDestination(resource, vault, fileSystem, store);

      expect(() => {
        vault.updateResourcePath(resource.id, destination.path, destination.parentId);
      }).toThrow(`Path already in use by another resource: ${ROOT}/Assets/hero.png`);
    });
  });
});
