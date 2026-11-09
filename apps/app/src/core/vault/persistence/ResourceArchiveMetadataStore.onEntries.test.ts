import { describe, expect, it } from 'vitest';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { ArchivedResourceOriginIndex } from './ArchivedResourceOriginIndex';
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';

const ROOT = '/vault';

async function setup() {
  const fileSystem = new InMemoryVaultFileSystem();
  await fileSystem.createDirectory(ROOT);
  const index = new ArchivedResourceOriginIndex();
  const store = new ResourceArchiveMetadataStore(fileSystem, ROOT, (entries) => index.replaceAll(entries));
  return { store, index };
}

describe('ResourceArchiveMetadataStore keeps an in-memory copy current', () => {
  it('every write is reflected by the time it resolves: record, re-key, remove', async () => {
    const { store, index } = await setup();

    await store.record('/vault/Archive/a.png', '/vault/Assets/a.png');
    expect(index.originalPathOf('/vault/Archive/a.png')).toBe('/vault/Assets/a.png');

    await store.updateArchivedPath('/vault/Archive/a.png', '/vault/Archive/b.png');
    expect(index.originalPathOf('/vault/Archive/a.png')).toBeUndefined();
    expect(index.originalPathOf('/vault/Archive/b.png')).toBe('/vault/Assets/a.png');

    await store.remove('/vault/Archive/b.png');
    expect(index.originalPathOf('/vault/Archive/b.png')).toBeUndefined();
  });

  it('a record removed because its file is confirmed missing leaves the copy too; one kept stays', async () => {
    const { store, index } = await setup();
    await store.record('/vault/Archive/gone.png', '/vault/Assets/gone.png');
    await store.record('/vault/Archive/here.png', '/vault/Assets/here.png');

    await store.removeRecordsOfMissingFiles(async (path) => path.endsWith('gone.png'));

    expect(index.originalPathOf('/vault/Archive/gone.png')).toBeUndefined();
    expect(index.originalPathOf('/vault/Archive/here.png')).toBe('/vault/Assets/here.png');
  });

  it('a read at startup loads the copy from the file', async () => {
    const { store } = await setup();
    await store.record('/vault/Archive/a.png', '/vault/Assets/a.png');
    const fresh = new ArchivedResourceOriginIndex();
    const reopened = new ResourceArchiveMetadataStore((store as unknown as { fileSystem: never }).fileSystem, ROOT, (entries) =>
      fresh.replaceAll(entries)
    );

    await reopened.read();

    expect(fresh.originalPathOf('/vault/Archive/a.png')).toBe('/vault/Assets/a.png');
  });
});
