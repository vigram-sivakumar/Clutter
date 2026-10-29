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

    expect(await persistSyncedFolderDocument(deps, folder)).toBe(true);

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

  it('ignores the fields the repair itself changes (archive metadata)', async () => {
    const archived: Folder = { ...folder, metadata: { ...folder.metadata, status: 'archived', archivedAt: '2026-10-28T00:00:00.000Z' } };
    const { disk, deps } = setup({ [PATH]: onDisk() });

    const written = await persistSyncedFolderDocument(deps, archived, { repairs: ['status', 'archivedAt', 'originalPath', 'originalParentId'] });

    expect(written).toBe(true);
    expect(await disk.readFile(PATH)).toContain('archived');
  });

  it('refuses an edit that lands between its read and its write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { disk, writer, deps, stale } = setup({ [PATH]: onDisk() });
    const write = writer.write.bind(writer);
    vi.spyOn(writer, 'write').mockImplementation(async (attempt) => {
      await disk.writeFile(PATH, onDisk({ description: 'landed in the gap' }));

      return write(attempt);
    });

    expect(await persistSyncedFolderDocument(deps, folder)).toBe(false);

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
