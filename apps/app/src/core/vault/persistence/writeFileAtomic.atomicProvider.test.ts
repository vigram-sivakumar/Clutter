import { describe, expect, it } from 'vitest';
import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { writeFileAtomic } from './writeFileAtomic';

describe('writeFileAtomic on a provider that already replaces files whole', () => {
  it('writes the target directly: no sibling temp file to leave behind, and a stale one from a crash is no obstacle', async () => {
    const disk = new InMemoryVaultFileSystem({ '/v/.clutter/tags.json': 'old', '/v/.clutter/tags.json.tmp': 'left by a crash' });
    const writer = new InMemoryAtomicVaultWriter(disk);

    await writeFileAtomic(new AtomicWriteFileSystem(disk, writer), '/v/.clutter/tags.json', 'new');

    expect(await disk.readFile('/v/.clutter/tags.json')).toBe('new');
    expect(writer.calls).toEqual(['write:upsert:/v/.clutter/tags.json']);
    expect(await disk.readFile('/v/.clutter/tags.json.tmp')).toBe('left by a crash');
  });

  it('a provider that does not replace whole still stages a temp file and renames it (unchanged)', async () => {
    const disk = new InMemoryVaultFileSystem({ '/v/.clutter/tags.json': 'old' });

    await writeFileAtomic(disk, '/v/.clutter/tags.json', 'new');

    expect(await disk.readFile('/v/.clutter/tags.json')).toBe('new');
    expect(await disk.exists('/v/.clutter/tags.json.tmp')).toBe(false);
  });
});
