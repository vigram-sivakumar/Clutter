import { describe, expect, it, vi } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { VaultQuery } from '../../vault/queries/VaultQuery';
import { MembershipSelector } from '../../application/membership/MembershipSelector';
import type { Folder } from '../../vault/models/Folder';
import type { VaultResource } from '../../vault/models/VaultResource';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type { EffectivePageState } from '../../application/page/EffectivePageState';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

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

function makeArchiveFolder(): Folder {
  return makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
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

function makeVault(folders: Folder[], resources: VaultResource[]): Vault {
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

function setup(
  resource: VaultResource,
  folders: Folder[] = [],
  otherResources: VaultResource[] = []
) {
  const vault = makeVault(folders, [resource, ...otherResources]);
  const fileSystem = new InMemoryVaultFileSystem();
  fileSystem.seedFile(resource.path, 'binary-content');
  const moveService = new MoveService(vault, fileSystem);
  const resourceArchiveStore = new ResourceArchiveMetadataStore(fileSystem, ROOT);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService,
    resourceArchiveStore
  );

  return { vault, fileSystem, resourceArchiveStore, coordinator };
}

// A no-op VaultFileSystem wrapper that records which methods were called,
// and can be told to fail moveFile on demand — used to prove ordering
// (archive metadata is never written / restore metadata is never removed
// when the underlying filesystem move fails).
class RecordingFileSystem implements VaultFileSystem {
  readonly calls: string[] = [];
  failMoveFile = false;

  constructor(private readonly delegate: VaultFileSystem) {}

  async exists(path: string): Promise<boolean> {
    return this.delegate.exists(path);
  }

  async createDirectory(path: string): Promise<void> {
    this.calls.push(`createDirectory:${path}`);
    return this.delegate.createDirectory(path);
  }

  async readDirectory(path: string) {
    return this.delegate.readDirectory(path);
  }

  async readFile(path: string): Promise<string> {
    return this.delegate.readFile(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.calls.push(`writeFile:${path}`);
    return this.delegate.writeFile(path, contents);
  }

  async deleteFile(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.calls.push(`deleteFile:${path}`);
    return this.delegate.deleteFile(path, options);
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    this.calls.push(`moveFile:${sourcePath}->${destinationPath}`);

    if (this.failMoveFile) {
      throw new Error('Simulated filesystem failure');
    }

    return this.delegate.moveFile(sourcePath, destinationPath);
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    return this.delegate.copyFile(sourcePath, destinationPath);
  }

  async duplicate(sourcePath: string, kind: 'file' | 'directory'): Promise<string> {
    return this.delegate.duplicate!(sourcePath, kind);
  }
}

describe('PagePersistenceCoordinator: rename-resource', () => {
  it('renames the resource to the resolved destination', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, vault } = setup(resource);

    const result = await coordinator.enqueue(resource.id, {
      kind: 'rename-resource',
      title: 'holiday',
    });

    expect(result.status).toBe('resource-renamed');
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/holiday.png`);
  });

  it('preserves the extension', async () => {
    const resource = makeResource('resource-1', `${ROOT}/spec.pdf`);
    const { coordinator, vault } = setup(resource);

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'contract' });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/contract.pdf`);
  });

  it('updates the Vault resource path/name/parentId', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Assets`);
    const resource = makeResource('resource-1', `${ROOT}/Assets/photo.png`, 'folder-1');
    const { coordinator, vault } = setup(resource, [folder]);

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' });

    const renamed = vault.getResource('resource-1')!;
    expect(renamed.path).toBe(`${ROOT}/Assets/holiday.png`);
    expect(renamed.name).toBe('holiday.png');
    expect(renamed.parentId).toBe('folder-1');
  });

  it('keeps the resource id stable across the operation', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, vault } = setup(resource);

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' });

    expect(vault.getResource('resource-1')).toBeDefined();
    expect(vault.getResourceByPath(`${ROOT}/holiday.png`)!.id).toBe('resource-1');
  });

  it('actually moves the file on the underlying filesystem', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, fileSystem } = setup(resource);

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' });

    expect(await fileSystem.exists(`${ROOT}/photo.png`)).toBe(false);
    expect(await fileSystem.exists(`${ROOT}/holiday.png`)).toBe(true);
  });

  it('enforces the existing resource path-collision rule — auto-suffixes when the destination is already occupied by another resource (resolveResourceRenameDestination\'s own collision-avoidance, exercised end-to-end through the Gate)', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const occupant = makeResource('resource-2', `${ROOT}/holiday.png`);
    const { coordinator, vault } = setup(resource, [], [occupant]);

    const result = await coordinator.enqueue(resource.id, {
      kind: 'rename-resource',
      title: 'holiday',
    });

    expect(result.status).toBe('resource-renamed');
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/holiday 2.png`);
    // The occupant is untouched — no overwrite happened.
    expect(vault.getResource('resource-2')!.path).toBe(`${ROOT}/holiday.png`);
  });

  it('would reject a genuine destination collision that slips past resolution — the Gate\'s own defense-in-depth guard, exercised via a resolver stub since resolveResourceRenameDestination itself never returns a colliding destination', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const occupant = makeResource('resource-2', `${ROOT}/holiday.png`);
    const { coordinator, vault } = setup(resource, [], [occupant]);
    // Force the resolver to (incorrectly) hand back an already-occupied
    // destination, simulating the race the Gate's pre-move collision guard
    // exists to catch — proves assertResourceDestinationAvailable fires
    // before any fileSystem.moveFile call, not only Vault.updateResourcePath's
    // own after-the-fact check.
    vi.spyOn(MoveService.prototype, 'resolveResourceRenameDestination').mockReturnValue({
      path: `${ROOT}/holiday.png`,
      parentId: null,
    });

    await expect(
      coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' })
    ).rejects.toThrow(`Path already in use by another resource: ${ROOT}/holiday.png`);

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/photo.png`);
    vi.restoreAllMocks();
  });

  it('does not touch WikiLinks/references — deliberately deferred, no reference-rewriting call site exists for resources', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, fileSystem } = setup(resource);
    // No page content exists in this fixture at all — if rename ever
    // reached for link-rewriting machinery (mutateBody, TagOperations-style
    // occurrence rewriting), it would have nothing to operate on and no
    // page would be touched. The absence of any such call is the point.
    fileSystem.seedFile(`${ROOT}/Note.md`, '![[photo.png]]');

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' });

    expect(await fileSystem.readFile(`${ROOT}/Note.md`)).toBe('![[photo.png]]');
  });

  it('does not touch ResourceArchiveMetadataStore for a normal, non-archived rename', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, resourceArchiveStore } = setup(resource);

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' });

    expect((await resourceArchiveStore.read()).size).toBe(0);
  });

  it('re-keys the archive-provenance record when renaming a resource that currently sits inside Archive/ — otherwise a later Restore would look up the old archived path and find nothing', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, resourceArchiveStore } = setup(resource, [archiveFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/hero.png`);

    await coordinator.enqueue(resource.id, { kind: 'rename-resource', title: 'holiday' });

    const entries = await resourceArchiveStore.read();
    expect(entries.has(`${ROOT}/Archive/hero.png`)).toBe(false);
    expect(entries.get(`${ROOT}/Archive/holiday.png`)).toEqual({
      originalPath: `${ROOT}/Projects/hero.png`,
    });
  });
});

describe('PagePersistenceCoordinator: archive-resource', () => {
  it('moves the resource into Archive/', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Projects/Website/hero.png`, 'folder-website');
    const { coordinator, vault } = setup(resource, [archiveFolder, websiteFolder]);

    const result = await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    expect(result.status).toBe('resource-archived');
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Archive/hero.png`);
    expect(vault.getResource('resource-1')!.parentId).toBe(ARCHIVE_FOLDER_ID);
  });

  it('an image resource archives successfully end-to-end (status, Vault path, kind preserved)', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, vault } = setup(resource, [archiveFolder]);

    const result = await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    expect(result.status).toBe('resource-archived');
    const archived = vault.getResource('resource-1')!;
    expect(archived.path).toBe(`${ROOT}/Archive/hero.png`);
    expect(archived.kind).toBe('image');
  });

  it('a pdf resource archives successfully end-to-end (status, Vault path, kind preserved)', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource: VaultResource = { ...makeResource('resource-1', `${ROOT}/spec.pdf`), kind: 'pdf' };
    const { coordinator, vault } = setup(resource, [archiveFolder]);

    const result = await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    expect(result.status).toBe('resource-archived');
    const archived = vault.getResource('resource-1')!;
    expect(archived.path).toBe(`${ROOT}/Archive/spec.pdf`);
    expect(archived.kind).toBe('pdf');
  });

  it('the resource remains registered in the Vault after archiving — never removed, only relocated', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, vault } = setup(resource, [archiveFolder]);

    await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    expect(vault.getResource('resource-1')).toBeDefined();
    expect(vault.resourceCount).toBe(1);
  });

  it('preserves the original extension', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/spec.pdf`);
    const { coordinator, vault } = setup(resource, [archiveFolder]);

    await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Archive/spec.pdf`);
  });

  it('uses the existing collision-free Archive naming behavior when the destination is already taken', async () => {
    const archiveFolder = makeArchiveFolder();
    const alreadyArchived = makeResource('resource-archived', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, vault } = setup(resource, [archiveFolder], [alreadyArchived]);

    await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    const archived = vault.getResource('resource-1')!;
    expect(archived.path).not.toBe(`${ROOT}/Archive/hero.png`);
    expect(archived.path.startsWith(`${ROOT}/Archive/hero `)).toBe(true);
    expect(archived.path.endsWith('.png')).toBe(true);
  });

  it('records the original path in ResourceArchiveMetadataStore', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Projects/Website/hero.png`, 'folder-website');
    const { coordinator, resourceArchiveStore } = setup(resource, [archiveFolder, websiteFolder]);

    await coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    const entries = await resourceArchiveStore.read();
    expect(entries.get(`${ROOT}/Archive/hero.png`)).toEqual({
      originalPath: `${ROOT}/Projects/Website/hero.png`,
    });
  });

  it('does not write archive metadata if the filesystem move fails', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { resourceArchiveStore, fileSystem } = setup(resource, [archiveFolder]);
    const recording = new RecordingFileSystem(fileSystem);
    recording.failMoveFile = true;
    const vault = makeVault([archiveFolder], [resource]);
    const moveService = new MoveService(vault, recording);
    const failingCoordinator = new PagePersistenceCoordinator(
      recording,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService,
      resourceArchiveStore
    );

    await expect(
      failingCoordinator.enqueue(resource.id, { kind: 'archive-resource' })
    ).rejects.toThrow('Simulated filesystem failure');

    expect((await resourceArchiveStore.read()).size).toBe(0);
    // The resource's in-memory path is untouched too — no partial state.
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/hero.png`);
  });

  it('lazily materializes the reserved Archive folder when it does not exist yet, mirroring the page-side behavior', async () => {
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator } = setup(resource, []);

    // ensureReservedFolderForOperation (already shared with runArchive) is
    // what makes Archive/ available on demand — this proves the resource
    // path reuses that same mechanism rather than requiring the folder to
    // pre-exist.
    const result = await coordinator.enqueue(resource.id, { kind: 'archive-resource' });
    expect(result.status).toBe('resource-archived');
  });
});

describe('PagePersistenceCoordinator: restore-resource', () => {
  it('restores to the original path when the original parent still exists', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault, resourceArchiveStore } = setup(resource, [archiveFolder, websiteFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    const result = await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    expect(result.status).toBe('resource-restored');
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Projects/Website/hero.png`);
    expect(vault.getResource('resource-1')!.parentId).toBe('folder-website');
  });

  it('restores to the vault root when the original path was itself root-level', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault, resourceArchiveStore } = setup(resource, [archiveFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/hero.png`);

    await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/hero.png`);
    expect(vault.getResource('resource-1')!.parentId).toBeNull();
  });

  it('falls back to Assets/ when the original parent no longer exists', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault, resourceArchiveStore } = setup(resource, [archiveFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    const result = await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    expect(result.status).toBe('resource-restored');
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  // The full Assets-collection lifecycle (Step 9 §8): archive, then restore
  // with the original parent gone — the resource must land back in the
  // Assets logical collection (MembershipSelector.getAllVisibleResources),
  // must no longer read as archived, and must carry no leftover provenance
  // record, not just have the right Vault path (already covered above).
  it('after restoring to the Assets/ fallback, the resource is visible again in the Assets logical collection and no longer reads as archived', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault, resourceArchiveStore } = setup(resource, [archiveFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    const membershipSelector = new MembershipSelector(
      vault,
      new VaultQuery(vault),
      // isResourceArchived/getAllVisibleResources never touch
      // effectivePageState — only page-scoped methods on this class do —
      // so a minimal stand-in is safe here rather than constructing the
      // full PageOperations dependency chain for an unused collaborator.
      {} as EffectivePageState
    );

    const restored = vault.getResource('resource-1')!;
    expect(restored.path).toBe(`${ROOT}/Assets/hero.png`);
    expect(membershipSelector.isResourceArchived(restored)).toBe(false);
    expect(membershipSelector.getAllVisibleResources().map((r) => r.id)).toContain('resource-1');

    const entries = await resourceArchiveStore.read();
    expect(entries.has(`${ROOT}/Archive/hero.png`)).toBe(false);
    expect(entries.has(`${ROOT}/Assets/hero.png`)).toBe(false);
  });

  it('falls back to Assets/ when archive metadata is missing entirely', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault } = setup(resource, [archiveFolder]);
    // No resourceArchiveStore.record() call at all.

    await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  it('creates and registers Assets/ in Vault when it does not exist yet', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault, fileSystem } = setup(resource, [archiveFolder]);

    await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(true);
    expect(vault.getFolderByPath(`${ROOT}/Assets`)).toBeDefined();
  });

  it('throws on a collision at the resolved destination, without overwriting or auto-renaming', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const occupant = makeResource('resource-occupant', `${ROOT}/Projects/Website/hero.png`, 'folder-website');
    const { coordinator, vault, resourceArchiveStore } = setup(
      resource,
      [archiveFolder, websiteFolder],
      [occupant]
    );
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    await expect(coordinator.enqueue(resource.id, { kind: 'restore-resource' })).rejects.toThrow(
      `Path already in use by another resource: ${ROOT}/Projects/Website/hero.png`
    );

    // Neither resource moved.
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Archive/hero.png`);
    expect(vault.getResource('resource-occupant')!.path).toBe(`${ROOT}/Projects/Website/hero.png`);
  });

  it('removes the archive metadata record only after a successful restore', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, resourceArchiveStore } = setup(resource, [archiveFolder, websiteFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    const entries = await resourceArchiveStore.read();
    expect(entries.has(`${ROOT}/Archive/hero.png`)).toBe(false);
  });

  it('leaves the archive metadata record intact when the filesystem move fails', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { resourceArchiveStore, fileSystem } = setup(resource, [archiveFolder, websiteFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);
    const recording = new RecordingFileSystem(fileSystem);
    recording.failMoveFile = true;
    const vault = makeVault([archiveFolder, websiteFolder], [resource]);
    const moveService = new MoveService(vault, recording);
    const failingCoordinator = new PagePersistenceCoordinator(
      recording,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService,
      resourceArchiveStore
    );

    await expect(
      failingCoordinator.enqueue(resource.id, { kind: 'restore-resource' })
    ).rejects.toThrow('Simulated filesystem failure');

    const entries = await resourceArchiveStore.read();
    expect(entries.get(`${ROOT}/Archive/hero.png`)).toEqual({
      originalPath: `${ROOT}/Projects/Website/hero.png`,
    });
  });

  it('updates the Vault resource path after a successful restore', async () => {
    const archiveFolder = makeArchiveFolder();
    const websiteFolder = makeFolder('folder-website', `${ROOT}/Projects/Website`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, vault, resourceArchiveStore } = setup(resource, [archiveFolder, websiteFolder]);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/Website/hero.png`);

    await coordinator.enqueue(resource.id, { kind: 'restore-resource' });

    expect(vault.getResourceByPath(`${ROOT}/Archive/hero.png`)).toBeUndefined();
    expect(vault.getResourceByPath(`${ROOT}/Projects/Website/hero.png`)!.id).toBe('resource-1');
  });
});

describe('PagePersistenceCoordinator: move-resource', () => {
  it('moves the resource into the destination folder, preserving its filename', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, vault } = setup(resource, [folder]);

    const result = await coordinator.enqueue(resource.id, {
      kind: 'move-resource',
      destinationFolderId: 'folder-1',
    });

    expect(result.status).toBe('resource-moved');
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Projects/hero.png`);
    expect(vault.getResource('resource-1')!.parentId).toBe('folder-1');
  });

  it('moves the resource to the vault root when destinationFolderId is null', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/Projects/hero.png`, 'folder-1');
    const { coordinator, vault } = setup(resource, [folder]);

    await coordinator.enqueue(resource.id, { kind: 'move-resource', destinationFolderId: null });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/hero.png`);
    expect(vault.getResource('resource-1')!.parentId).toBeNull();
  });

  it('moves a resource into the managed Assets/ folder', async () => {
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, vault } = setup(resource, [assets]);

    await coordinator.enqueue(resource.id, {
      kind: 'move-resource',
      destinationFolderId: 'folder-assets',
    });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  it('moves a resource out of the managed Assets/ folder into an ordinary folder', async () => {
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { coordinator, vault } = setup(resource, [assets, folder]);

    await coordinator.enqueue(resource.id, {
      kind: 'move-resource',
      destinationFolderId: 'folder-1',
    });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Projects/hero.png`);
  });

  it('actually moves the file on the underlying filesystem', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, fileSystem } = setup(resource, [folder]);

    await coordinator.enqueue(resource.id, {
      kind: 'move-resource',
      destinationFolderId: 'folder-1',
    });

    expect(await fileSystem.exists(`${ROOT}/hero.png`)).toBe(false);
    expect(await fileSystem.exists(`${ROOT}/Projects/hero.png`)).toBe(true);
  });

  it('auto-suffixes when the destination filename is already occupied by another resource', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const occupant = makeResource('resource-2', `${ROOT}/Projects/hero.png`, 'folder-1');
    const { coordinator, vault } = setup(resource, [folder], [occupant]);

    await coordinator.enqueue(resource.id, {
      kind: 'move-resource',
      destinationFolderId: 'folder-1',
    });

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Projects/hero 1.png`);
    expect(vault.getResource('resource-2')!.path).toBe(`${ROOT}/Projects/hero.png`);
  });

  it('rejects moving into the reserved Daily Notes folder', async () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator } = setup(resource, [dailyNotes]);

    await expect(
      coordinator.enqueue(resource.id, {
        kind: 'move-resource',
        destinationFolderId: 'folder-daily-notes',
      })
    ).rejects.toThrow(/Cannot move into Daily Notes/);
  });

  it('abandons harmlessly for an unknown resource id', async () => {
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator } = setup(resource);

    const result = await coordinator.enqueue('missing', {
      kind: 'move-resource',
      destinationFolderId: null,
    });

    expect(result).toEqual({
      status: 'abandoned',
      reason: 'Resource no longer exists in the vault: missing',
    });
  });

  it('does not touch ResourceArchiveMetadataStore — Move is not Archive/Restore', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, resourceArchiveStore } = setup(resource, [folder]);

    await coordinator.enqueue(resource.id, {
      kind: 'move-resource',
      destinationFolderId: 'folder-1',
    });

    expect((await resourceArchiveStore.read()).size).toBe(0);
  });
});

describe('PagePersistenceCoordinator: delete-resource', () => {
  it('deletes the resource from the filesystem', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const { coordinator, fileSystem } = setup(resource);

    const result = await coordinator.enqueue(resource.id, { kind: 'delete-resource' });

    expect(result.status).toBe('resource-deleted');
    expect(await fileSystem.exists(`${ROOT}/Archive/hero.png`)).toBe(false);
  });

  it('removes the resource from the Vault', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const { coordinator, vault } = setup(resource);

    await coordinator.enqueue(resource.id, { kind: 'delete-resource' });

    expect(vault.getResource('resource-1')).toBeUndefined();
    expect(vault.resourceCount).toBe(0);
  });

  it('removes any archive-provenance record for the resource', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const { coordinator, resourceArchiveStore } = setup(resource);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/hero.png`);

    await coordinator.enqueue(resource.id, { kind: 'delete-resource' });

    const entries = await resourceArchiveStore.read();
    expect(entries.has(`${ROOT}/Archive/hero.png`)).toBe(false);
  });

  it('is a no-op when no archive-provenance record exists (deleting a resource that was never archived)', async () => {
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, resourceArchiveStore } = setup(resource);

    const result = await coordinator.enqueue(resource.id, { kind: 'delete-resource' });

    expect(result.status).toBe('resource-deleted');
    expect((await resourceArchiveStore.read()).size).toBe(0);
  });

  it('works identically for a pdf resource', async () => {
    const resource: VaultResource = { ...makeResource('resource-1', `${ROOT}/Archive/spec.pdf`), kind: 'pdf' };
    const { coordinator, vault, fileSystem } = setup(resource);

    const result = await coordinator.enqueue(resource.id, { kind: 'delete-resource' });

    expect(result.status).toBe('resource-deleted');
    expect(vault.getResource('resource-1')).toBeUndefined();
    expect(await fileSystem.exists(`${ROOT}/Archive/spec.pdf`)).toBe(false);
  });

  it('abandons harmlessly for an unknown resource id', async () => {
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator } = setup(resource);

    const result = await coordinator.enqueue('missing', { kind: 'delete-resource' });

    expect(result).toEqual({
      status: 'abandoned',
      reason: 'Resource no longer exists in the vault: missing',
    });
  });

  it('does not remove the archive-provenance record or the Vault entry if the filesystem delete fails', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const { resourceArchiveStore, fileSystem } = setup(resource);
    await resourceArchiveStore.record(`${ROOT}/Archive/hero.png`, `${ROOT}/Projects/hero.png`);
    const vault = makeVault([], [resource]);
    const moveService = new MoveService(vault, fileSystem);
    // Force fileSystem.deleteFile to fail by removing the underlying file
    // first — InMemoryVaultFileSystem throws "path not found" on a second
    // delete, simulating a real filesystem delete failure without a
    // dedicated failing-fileSystem wrapper for this one case.
    await fileSystem.deleteFile(`${ROOT}/Archive/hero.png`);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService,
      resourceArchiveStore
    );

    await expect(
      coordinator.enqueue(resource.id, { kind: 'delete-resource' })
    ).rejects.toThrow();

    const entries = await resourceArchiveStore.read();
    expect(entries.get(`${ROOT}/Archive/hero.png`)).toEqual({
      originalPath: `${ROOT}/Projects/hero.png`,
    });
    expect(vault.getResource('resource-1')).toBeDefined();
  });
});

describe('PagePersistenceCoordinator: resource operation ordering', () => {
  it('two operations enqueued for the same resource id resolve in enqueue order', async () => {
    const archiveFolder = makeArchiveFolder();
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, vault } = setup(resource, [archiveFolder]);

    const renamePromise = coordinator.enqueue(resource.id, {
      kind: 'rename-resource',
      title: 'holiday',
    });
    const archivePromise = coordinator.enqueue(resource.id, { kind: 'archive-resource' });

    const [renameResult, archiveResult] = await Promise.all([renamePromise, archivePromise]);

    expect(renameResult.status).toBe('resource-renamed');
    expect(archiveResult.status).toBe('resource-archived');
    // The archive ran against the already-renamed resource, not a stale
    // pre-rename path — proof the two operations executed in order rather
    // than racing against a captured-at-enqueue-time snapshot.
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Archive/holiday.png`);
  });

  it('operations for two different resource ids do not block each other', async () => {
    const resourceA = makeResource('resource-a', `${ROOT}/a.png`);
    const resourceB = makeResource('resource-b', `${ROOT}/b.png`);
    const vault = makeVault([], [resourceA, resourceB]);
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(resourceA.path, 'a');
    fileSystem.seedFile(resourceB.path, 'b');
    const moveService = new MoveService(vault, fileSystem);
    const resourceArchiveStore = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService,
      resourceArchiveStore
    );

    const [resultA, resultB] = await Promise.all([
      coordinator.enqueue('resource-a', { kind: 'rename-resource', title: 'renamed-a' }),
      coordinator.enqueue('resource-b', { kind: 'rename-resource', title: 'renamed-b' }),
    ]);

    expect(resultA.status).toBe('resource-renamed');
    expect(resultB.status).toBe('resource-renamed');
    expect(vault.getResource('resource-a')!.path).toBe(`${ROOT}/renamed-a.png`);
    expect(vault.getResource('resource-b')!.path).toBe(`${ROOT}/renamed-b.png`);
  });
});
