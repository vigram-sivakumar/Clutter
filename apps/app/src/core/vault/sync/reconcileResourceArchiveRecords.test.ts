import { describe, expect, it, vi } from 'vitest';

import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { ResourceArchiveMetadataStore } from '../persistence/ResourceArchiveMetadataStore';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { confirmFileMissing } from './confirmFileMissing';
import { reconcileResourceArchiveRecords } from './reconcileResourceArchiveRecords';
import { VaultSyncService } from './VaultSyncService';

const ROOT = '/vault';
const ARCHIVE = `${ROOT}/Archive`;
const RECORDS = `${ROOT}/.clutter/resource-archive.json`;
const AT = '2026-01-01T00:00:00.000Z';

const archiveFolder = {
  id: 'archive',
  name: 'Archive',
  path: ARCHIVE,
  parentId: null,
  metadata: {
    defaultTemplateId: null,
    icon: null,
    favorite: false,
    description: '',
    cover: null,
    coverHidden: false,
    coverLayout: 'side' as const,
    coverPositionAbove: 50,
    coverPositionSide: 50,
    status: 'active' as const,
    archivedAt: null,
    originalPath: null,
    originalParentId: null,
  },
};

async function setup(files: string[] = []) {
  const fileSystem = new InMemoryVaultFileSystem();
  await fileSystem.createDirectory(ARCHIVE);
  for (const name of files) fileSystem.seedFile(`${ARCHIVE}/${name}`, 'binary');
  const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);
  return { fileSystem, store };
}

const recordsOf = async (store: ResourceArchiveMetadataStore) => [...(await store.read()).keys()].sort();

describe('confirmFileMissing: only a positive answer counts', () => {
  it('is true only when the parent was listed and the name is not in it', async () => {
    const { fileSystem } = await setup(['here.png']);

    expect(await confirmFileMissing(fileSystem, `${ARCHIVE}/gone.png`)).toBe(true);
    expect(await confirmFileMissing(fileSystem, `${ARCHIVE}/here.png`)).toBe(false);
  });

  it('a name that differs only by case or Unicode normalisation is present, not missing', async () => {
    const { fileSystem } = await setup(['Caf\u00e9.png']);

    expect(await confirmFileMissing(fileSystem, `${ARCHIVE}/CAFE\u0301.PNG`)).toBe(false);
  });

  it('is false when the parent directory is missing: an unmounted folder looks like a deleted one', async () => {
    const { fileSystem } = await setup();

    expect(await confirmFileMissing(fileSystem, `${ROOT}/Elsewhere/gone.png`)).toBe(false);
  });

  it('is false when listing the directory fails, or when exists() fails', async () => {
    const { fileSystem } = await setup();
    vi.spyOn(fileSystem, 'readDirectory').mockRejectedValue(new Error('permission denied'));
    expect(await confirmFileMissing(fileSystem, `${ARCHIVE}/gone.png`)).toBe(false);

    vi.restoreAllMocks();
    vi.spyOn(fileSystem, 'exists').mockRejectedValue(new Error('I/O error'));
    expect(await confirmFileMissing(fileSystem, `${ARCHIVE}/gone.png`)).toBe(false);
  });

  it('is false for a path it cannot split', async () => {
    const { fileSystem } = await setup();

    expect(await confirmFileMissing(fileSystem, 'gone.png')).toBe(false);
    expect(await confirmFileMissing(fileSystem, `${ARCHIVE}/`)).toBe(false);
  });
});

describe('startup reconciliation of resource archive records', () => {
  it('removes the record of a confirmed-missing file, keeps the others, and never touches a file', async () => {
    const { fileSystem, store } = await setup(['present.png']);
    await store.record(`${ARCHIVE}/present.png`, `${ROOT}/Assets/present.png`, AT);
    await store.record(`${ARCHIVE}/gone.png`, `${ROOT}/Assets/gone.png`, AT);
    const deleteFile = vi.spyOn(fileSystem, 'deleteFile');
    const moveFile = vi.spyOn(fileSystem, 'moveFile');
    // (the store's own staged rename of its record file, on this non-atomic test provider, is its write, not a file move)

    const removed = await reconcileResourceArchiveRecords(store, fileSystem);

    expect(removed).toEqual([`${ARCHIVE}/gone.png`]);
    expect(await recordsOf(store)).toEqual([`${ARCHIVE}/present.png`]);
    expect((await store.read()).get(`${ARCHIVE}/present.png`)).toEqual({
      originalPath: `${ROOT}/Assets/present.png`,
      archivedAt: AT,
    });
    expect(await fileSystem.exists(`${ARCHIVE}/present.png`)).toBe(true);
    expect(deleteFile).not.toHaveBeenCalled();
    expect(moveFile.mock.calls.filter(([from]) => !String(from).startsWith(RECORDS))).toEqual([]);
  });

  it('keeps every record, and writes nothing, when the filesystem cannot be read', async () => {
    const { fileSystem, store } = await setup();
    await store.record(`${ARCHIVE}/gone.png`, `${ROOT}/Assets/gone.png`, AT);
    const before = await fileSystem.readFile(RECORDS);
    vi.spyOn(fileSystem, 'readDirectory').mockRejectedValue(new Error('permission denied'));
    const write = vi.spyOn(fileSystem, 'writeFile');

    expect(await reconcileResourceArchiveRecords(store, fileSystem)).toEqual([]);

    expect(await fileSystem.readFile(RECORDS)).toBe(before);
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps the records of a directory that is missing altogether', async () => {
    const { fileSystem, store } = await setup();
    await store.record(`${ROOT}/Offline/gone.png`, `${ROOT}/Assets/gone.png`, AT);

    expect(await reconcileResourceArchiveRecords(store, fileSystem)).toEqual([]);
    expect(await recordsOf(store)).toEqual([`${ROOT}/Offline/gone.png`]);
  });

  it('writes nothing when every record is still backed by a file', async () => {
    const { fileSystem, store } = await setup(['a.png']);
    await store.record(`${ARCHIVE}/a.png`, `${ROOT}/a.png`, AT);
    const write = vi.spyOn(fileSystem, 'writeFile');

    expect(await reconcileResourceArchiveRecords(store, fileSystem)).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  it('leaves a corrupt record file exactly as it is and does not throw', async () => {
    const { fileSystem, store } = await setup();
    fileSystem.seedFile(RECORDS, '{ not json');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(reconcileResourceArchiveRecords(store, fileSystem)).resolves.toEqual([]);
    expect(await fileSystem.readFile(RECORDS)).toBe('{ not json');
  });

  it('persists the removal through the atomic writer', async () => {
    const disk = new InMemoryVaultFileSystem();
    await disk.createDirectory(ARCHIVE);
    const writer = new InMemoryAtomicVaultWriter(disk);
    const atomic = new AtomicWriteFileSystem(disk, writer);
    const store = new ResourceArchiveMetadataStore(atomic, ROOT);
    await store.record(`${ARCHIVE}/gone.png`, `${ROOT}/a.png`, AT);
    writer.calls.length = 0;

    await reconcileResourceArchiveRecords(store, atomic);

    expect(writer.calls).toEqual([`write:upsert:${RECORDS}`]);
    expect(JSON.parse(await disk.readFile(RECORDS))).toEqual({ resources: {} });
  });

  it('a record written while the pass runs is not lost (the confirmation runs inside the store queue)', async () => {
    const { fileSystem, store } = await setup(['new.png']);
    await store.record(`${ARCHIVE}/gone.png`, `${ROOT}/a.png`, AT);

    const [removed] = await Promise.all([
      reconcileResourceArchiveRecords(store, fileSystem),
      store.record(`${ARCHIVE}/new.png`, `${ROOT}/new.png`, AT),
    ]);

    expect(removed).toEqual([`${ARCHIVE}/gone.png`]);
    expect(await recordsOf(store)).toEqual([`${ARCHIVE}/new.png`]);
  });
});

describe('live sync: an archived resource that vanished outside the app', () => {
  function liveSetup() {
    const gone = vi.fn();
    const fileSystem = new InMemoryVaultFileSystem();
    const vault = new Vault(
      ROOT,
      [],
      [archiveFolder],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder(),
      new Map(),
      [{ id: 'img', kind: 'image', name: 'hero.png', path: `${ARCHIVE}/hero.png`, parentId: 'archive' }]
    );
    const service = new VaultSyncService(
      vault,
      fileSystem,
      new FakeVaultFileSystemWatcher(),
      new DocumentRegistry(),
      new FrontmatterSerializer(),
      new FakeIdGenerator(),
      undefined,
      undefined,
      gone
    );
    return { vault, service, gone, fileSystem };
  }

  it('tells the hook only when the Vault really dropped the resource', async () => {
    const { vault, service, gone, fileSystem } = liveSetup();
    await fileSystem.createDirectory(ARCHIVE);
    fileSystem.seedFile(`${ARCHIVE}/hero.png`, 'binary');

    await service.reconcileKnownPath(`${ARCHIVE}/hero.png`);
    expect(gone).not.toHaveBeenCalled();
    expect(vault.getResourceByPath(`${ARCHIVE}/hero.png`)).toBeDefined();

    await fileSystem.deleteFile(`${ARCHIVE}/hero.png`);
    await service.reconcileKnownPath(`${ARCHIVE}/hero.png`);

    expect(gone).toHaveBeenCalledWith(`${ARCHIVE}/hero.png`);
    expect(vault.getResourceByPath(`${ARCHIVE}/hero.png`)).toBeUndefined();
  });

  it('with the store: the record goes on a positive confirmation, and stays when the check is in doubt', async () => {
    const { fileSystem, store } = await setup(['hero.png']);
    await store.record(`${ARCHIVE}/hero.png`, `${ROOT}/hero.png`, AT);
    await fileSystem.deleteFile(`${ARCHIVE}/hero.png`);

    vi.spyOn(fileSystem, 'readDirectory').mockRejectedValueOnce(new Error('permission denied'));
    await store.removeRecordsOfMissingFiles((path) => confirmFileMissing(fileSystem, path), [`${ARCHIVE}/hero.png`]);
    expect(await recordsOf(store)).toEqual([`${ARCHIVE}/hero.png`]);

    await store.removeRecordsOfMissingFiles((path) => confirmFileMissing(fileSystem, path), [`${ARCHIVE}/hero.png`]);
    expect(await recordsOf(store)).toEqual([]);
  });
});
