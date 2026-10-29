import { describe, expect, it, vi } from 'vitest';
import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import type { Folder } from '../models/Folder';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { persistSyncedFolderDocument } from './persistSyncedFolderDocument';

const PATH = '/vault/Projects/.folder.md';
const serializer = new FrontmatterSerializer();

const folder: Folder = {
  id: 'folder-new-id',
  name: 'Projects',
  path: '/vault/Projects',
  parentId: null,
  metadata: {
    icon: '📁',
    favorite: false,
    description: 'mine',
    cover: null,
    coverHidden: false,
    coverLayout: 'side',
    coverPositionAbove: 50,
    coverPositionSide: 50,
    defaultTemplateId: null,
    status: 'active',
    archivedAt: null,
    originalPath: null,
    originalParentId: null,
  },
};

function setup(files: Record<string, string>) {
  const disk = new InMemoryVaultFileSystem(files);
  const writer = new InMemoryAtomicVaultWriter(disk);
  const stale: string[] = [];

  return {
    disk,
    writer,
    stale,
    deps: { fileSystem: new AtomicWriteFileSystem(disk, writer), serializer, onStale: (path: string) => stale.push(path) },
  };
}

const onDisk = (overrides: Partial<Folder['metadata']> = {}, id = 'folder-old-id') =>
  serializer.serializeFolderDocument({ ...folder, id, metadata: { ...folder.metadata, ...overrides } });

describe('persistSyncedFolderDocument under the atomic provider', () => {
  it('repairs a .folder.md whose other metadata still matches, replacing it only while it holds the text it read', async () => {
    const { disk, writer, deps, stale } = setup({ [PATH]: onDisk() });

    expect(await persistSyncedFolderDocument(deps, folder, { idStillNeedsRepair: (id) => id === 'folder-old-id' })).toBe(true);

    expect(await disk.readFile(PATH)).toContain('folder-new-id');
    expect(writer.calls).toContain(`write:replaceIfContent:${PATH}`);
    expect(stale).toEqual([]);
  });

  it('refuses when an external edit changed a field the repair does not own, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { disk, writer, deps, stale } = setup({ [PATH]: onDisk({ description: 'edited elsewhere' }) });

    expect(await persistSyncedFolderDocument(deps, folder)).toBe(false);

    expect(await disk.readFile(PATH)).toContain('edited elsewhere');
    expect(writer.calls.some((call) => call.startsWith('write:'))).toBe(false);
    expect(stale).toEqual(['/vault/Projects']);
    warn.mockRestore();
  });

  it('an archive correction is made from the metadata it inspected: if another app changed a field it is about to replace, nothing is overwritten', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const inspected: Folder = { ...folder, metadata: { ...folder.metadata, status: 'archived', archivedAt: '2026-01-01T00:00:00.000Z' } };
    const corrected: Folder = { ...inspected, metadata: { ...inspected.metadata, archivedAt: '2026-10-28T00:00:00.000Z' } };

    // Unchanged since inspection: repaired.
    const unchanged = setup({ [PATH]: onDisk({ status: 'archived', archivedAt: '2026-01-01T00:00:00.000Z' }, 'folder-new-id') });
    expect(await persistSyncedFolderDocument(unchanged.deps, corrected, { inspected })).toBe(true);
    expect(await unchanged.disk.readFile(PATH)).toContain('2026-10-28');

    // Another app changed the very field the correction replaces: refused, theirs kept.
    const changed = setup({ [PATH]: onDisk({ status: 'archived', archivedAt: '2026-05-05T00:00:00.000Z' }, 'folder-new-id') });
    expect(await persistSyncedFolderDocument(changed.deps, corrected, { inspected })).toBe(false);
    expect(await changed.disk.readFile(PATH)).toContain('2026-05-05');
    expect(changed.stale).toEqual(['/vault/Projects']);

    // Another app unarchived it entirely.
    const unarchived = setup({ [PATH]: onDisk({ status: 'active' }, 'folder-new-id') });
    expect(await persistSyncedFolderDocument(unarchived.deps, corrected, { inspected })).toBe(false);
    expect(await unarchived.disk.readFile(PATH)).toContain('active');
    warn.mockRestore();
  });

  it('a duplicate-id repair is not applied to an id another app changed meanwhile', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const keepsOtherFolder = (id: string | undefined) => id === 'folder-dup'; // some other folder holds `folder-dup`
    const needsRepair = (id: string | undefined) => id !== undefined && id !== folder.id && keepsOtherFolder(id);

    const stillDuplicate = setup({ [PATH]: onDisk({}, 'folder-dup') });
    expect(await persistSyncedFolderDocument(stillDuplicate.deps, folder, { idStillNeedsRepair: needsRepair })).toBe(true);
    expect(await stillDuplicate.disk.readFile(PATH)).toContain('folder-new-id');

    // The id was changed to something else (unique) by another app: theirs stays.
    const changedElsewhere = setup({ [PATH]: onDisk({}, 'folder-chosen-elsewhere') });
    expect(await persistSyncedFolderDocument(changedElsewhere.deps, folder, { idStillNeedsRepair: needsRepair })).toBe(false);
    expect(await changedElsewhere.disk.readFile(PATH)).toContain('folder-chosen-elsewhere');
    expect(changedElsewhere.stale).toEqual(['/vault/Projects']);
    warn.mockRestore();
  });

  it('without an id repair, a file whose id someone else changed is not overwritten either', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { disk, deps } = setup({ [PATH]: onDisk({}, 'someone-elses-id') });

    expect(await persistSyncedFolderDocument(deps, folder)).toBe(false);

    expect(await disk.readFile(PATH)).toContain('someone-elses-id');
    warn.mockRestore();
  });

  it('refuses an edit that lands between its read and its write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { disk, writer, deps, stale } = setup({ [PATH]: onDisk() });
    const write = writer.write.bind(writer);
    vi.spyOn(writer, 'write').mockImplementation(async (attempt) => {
      await disk.writeFile(PATH, onDisk({ description: 'landed in the gap' }));

      return write(attempt);
    });

    expect(await persistSyncedFolderDocument(deps, folder, { idStillNeedsRepair: (id) => id === 'folder-old-id' })).toBe(false);

    expect(await disk.readFile(PATH)).toContain('landed in the gap');
    expect(stale).toEqual(['/vault/Projects']);
    warn.mockRestore();
  });

  it('never re-creates a .folder.md that was deleted unless the repair may create it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { disk, deps, stale } = setup({});

    expect(await persistSyncedFolderDocument(deps, folder)).toBe(false);
    expect(await disk.exists(PATH)).toBe(false);
    expect(stale).toEqual(['/vault/Projects']);

    expect(await persistSyncedFolderDocument(deps, folder, { mayCreate: true })).toBe(true);
    expect(await disk.exists(PATH)).toBe(true);
    warn.mockRestore();
  });

  it('a provider that does not replace whole writes as before (a plain replace or upsert)', async () => {
    const disk = new InMemoryVaultFileSystem({ [PATH]: onDisk({ description: 'edited elsewhere' }) });

    expect(await persistSyncedFolderDocument({ fileSystem: disk, serializer }, folder)).toBe(true);

    expect(await disk.readFile(PATH)).toContain('mine');
  });
});
