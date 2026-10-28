import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';

/**
 * An in-memory filesystem whose every write is already perfectly ATOMIC (a whole string replaces the old one in one
 * step), but whose reads take a turn of the event loop, as real I/O does. If a logical update can still be lost here,
 * the loss is not about torn files: atomic replacement cannot fix it.
 */
class SlowReadFileSystem extends InMemoryVaultFileSystem {
  async readFile(path: string): Promise<string> {
    const contents = await super.readFile(path);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return contents;
  }
}

const ROOT = '/vault';
const store = () => new ResourceArchiveMetadataStore(new SlowReadFileSystem(), ROOT);

describe('ResourceArchiveMetadataStore: concurrent read-modify-write', () => {
  it('sequential updates keep every record (the baseline)', async () => {
    const records = store();

    await records.record('Archive/a.png', 'a.png', '2026-01-01T00:00:00.000Z');
    await records.record('Archive/b.png', 'b.png', '2026-01-01T00:00:00.000Z');

    expect([...(await records.read()).keys()].sort()).toEqual(['Archive/a.png', 'Archive/b.png']);
  });

  it('two concurrent archives both leave their record', async () => {
    const records = store();

    await Promise.all([
      records.record('Archive/a.png', 'a.png', '2026-01-01T00:00:00.000Z'),
      records.record('Archive/b.png', 'b.png', '2026-01-01T00:00:00.000Z'),
    ]);

    expect([...(await records.read()).keys()].sort()).toEqual(['Archive/a.png', 'Archive/b.png']);
  });

  it('many concurrent archives all survive, in the order they were requested', async () => {
    const records = store();
    const names = Array.from({ length: 12 }, (_, index) => `Archive/file-${String(index).padStart(2, '0')}.png`);

    await Promise.all(names.map((name, index) => records.record(name, `file-${index}.png`, '2026-01-01T00:00:00.000Z')));

    expect([...(await records.read()).keys()]).toEqual(names);
  });

  it('a restore racing an archive keeps the new record and drops the restored one, whichever order they interleave in', async () => {
    const records = store();
    await records.record('Archive/old.png', 'old.png', '2026-01-01T00:00:00.000Z');

    await Promise.all([records.remove('Archive/old.png'), records.record('Archive/new.png', 'new.png', '2026-01-01T00:00:00.000Z')]);

    expect([...(await records.read()).keys()]).toEqual(['Archive/new.png']);
  });

  it('a rename racing an archive neither loses the renamed record nor the new one', async () => {
    const records = store();
    await records.record('Archive/a.png', 'a.png', '2026-01-01T00:00:00.000Z');

    await Promise.all([records.updateArchivedPath('Archive/a.png', 'Archive/renamed.png'), records.record('Archive/b.png', 'b.png', '2026-01-01T00:00:00.000Z')]);

    const read = await records.read();
    expect([...read.keys()].sort()).toEqual(['Archive/b.png', 'Archive/renamed.png']);
    expect(read.get('Archive/renamed.png')?.originalPath).toBe('a.png');
  });

  it('a failed operation does not wedge the queue: its caller sees the failure and the next operation still runs', async () => {
    const fileSystem = new SlowReadFileSystem();
    const records = new ResourceArchiveMetadataStore(fileSystem, ROOT);
    await records.record('Archive/a.png', 'a.png', '2026-01-01T00:00:00.000Z');
    // The file becomes unparsable: the next read-modify-write throws, as it did before the queue existed.
    await fileSystem.writeFile(`${ROOT}/.clutter/resource-archive.json`, '{ not json');

    await expect(records.record('Archive/b.png', 'b.png')).rejects.toThrow();
    await fileSystem.writeFile(`${ROOT}/.clutter/resource-archive.json`, '{"resources":{}}');
    await records.record('Archive/c.png', 'c.png', '2026-01-01T00:00:00.000Z');

    expect([...(await records.read()).keys()]).toEqual(['Archive/c.png']);
  });

  it('serialising does not change what any single operation does', async () => {
    const records = store();
    await records.record('Archive/a.png', 'a.png', '2026-01-01T00:00:00.000Z');

    await records.updateArchivedPath('Archive/missing.png', 'Archive/x.png'); // no record: a no-op
    await records.remove('Archive/missing.png'); // no record: a no-op
    await records.updateArchivedPath('Archive/a.png', 'Archive/b.png');

    expect([...(await records.read())]).toEqual([['Archive/b.png', { originalPath: 'a.png', archivedAt: '2026-01-01T00:00:00.000Z' }]]);
  });
});
