import { describe, expect, it } from 'vitest';
import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';

const ROOT = '/vault';
const FILE = `${ROOT}/.clutter/resource-archive.json`;
const AT = '2026-01-01T00:00:00.000Z';

describe('ResourceArchiveMetadataStore writes atomically', () => {
  it('replaces the file through the atomic writer on an atomic provider, keeping the JSON shape', async () => {
    const disk = new InMemoryVaultFileSystem();
    const writer = new InMemoryAtomicVaultWriter(disk);
    const store = new ResourceArchiveMetadataStore(new AtomicWriteFileSystem(disk, writer), ROOT);

    await store.record('Archive/a.png', 'a.png', AT);
    await store.record('Archive/b.png', 'b.png', AT);

    expect(writer.calls.filter((call) => call.endsWith(FILE))).toEqual([`write:upsert:${FILE}`, `write:upsert:${FILE}`]);
    expect(JSON.parse(await disk.readFile(FILE))).toEqual({
      resources: {
        'Archive/a.png': { originalPath: 'a.png', archivedAt: AT },
        'Archive/b.png': { originalPath: 'b.png', archivedAt: AT },
      },
    });
    expect(await disk.exists(`${FILE}.tmp`)).toBe(false);
  });

  it('stages a temp file and renames it on a provider that is not atomic, leaving no temp file behind', async () => {
    const disk = new InMemoryVaultFileSystem();
    const store = new ResourceArchiveMetadataStore(disk, ROOT);

    await store.record('Archive/a.png', 'a.png', AT);
    await store.record('Archive/b.png', 'b.png', AT);

    expect([...(await store.read()).keys()].sort()).toEqual(['Archive/a.png', 'Archive/b.png']);
    expect(await disk.exists(`${FILE}.tmp`)).toBe(false);
  });

  it('a failed write preserves the original file and the record set, and the next write works', async () => {
    class FailingStageFileSystem extends InMemoryVaultFileSystem {
      failStaging = false;
      async writeFile(path: string, contents: string) {
        if (this.failStaging && path.endsWith('.tmp')) throw new Error('disk full');
        return super.writeFile(path, contents);
      }
    }
    const disk = new FailingStageFileSystem();
    const store = new ResourceArchiveMetadataStore(disk, ROOT);
    await store.record('Archive/a.png', 'a.png', AT);
    const before = await disk.readFile(FILE);

    disk.failStaging = true;
    await expect(store.record('Archive/b.png', 'b.png', AT)).rejects.toThrow('disk full');

    expect(await disk.readFile(FILE)).toBe(before);
    disk.failStaging = false;
    await store.record('Archive/b.png', 'b.png', AT);
    expect([...(await store.read()).keys()].sort()).toEqual(['Archive/a.png', 'Archive/b.png']);
  });

  it('a write the atomic writer refuses preserves the original file', async () => {
    const disk = new InMemoryVaultFileSystem();
    const writer = new InMemoryAtomicVaultWriter(disk);
    const store = new ResourceArchiveMetadataStore(new AtomicWriteFileSystem(disk, writer), ROOT);
    await store.record('Archive/a.png', 'a.png', AT);
    const before = await disk.readFile(FILE);

    writer.inject({ kind: 'not-committed', reason: 'insufficientSpace' });
    await expect(store.record('Archive/b.png', 'b.png', AT)).rejects.toThrow();

    expect(await disk.readFile(FILE)).toBe(before);
  });
});
