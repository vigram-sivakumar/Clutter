import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { TagMetadataStore } from './TagMetadataStore';

const ROOT = '/vault';
const PATH = `${ROOT}/.clutter/tags.json`;

let fileSystem: InMemoryVaultFileSystem;

beforeEach(() => {
  fileSystem = new InMemoryVaultFileSystem();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const store = (fs: VaultFileSystem = fileSystem) => new TagMetadataStore(fs, ROOT, () => 1700000000000);

describe('TagMetadataStore.load', () => {
  it('a missing file is no definitions', async () => {
    expect((await store().load()).size).toBe(0);
  });

  it('an empty / seed file is no definitions', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"tags":{}}');

    expect((await store().load()).size).toBe(0);
  });

  it('a valid file loads normalized definitions', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"version":2,"tags":{"Design":{"icon":"🎨"},"research":{}}}');

    const loaded = await store().load();

    expect(loaded.get('design')).toEqual({ icon: '🎨' });
    expect(loaded.get('research')).toEqual({});
  });

  it('a malformed file never throws: it opens empty and the original bytes are backed up', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"tags": {"design": ');

    const loaded = await store().load();

    expect(loaded.size).toBe(0);
    expect(await fileSystem.readFile(`${PATH}.corrupt-1700000000000`)).toBe('{"tags": {"design": ');
    // Not deleted or rewritten by loading.
    expect(await fileSystem.readFile(PATH)).toBe('{"tags": {"design": ');
  });

  it('a file that stays corrupt across reloads is backed up once', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, 'garbage');
    let clock = 1;
    const s = new TagMetadataStore(fileSystem, ROOT, () => clock++);

    await s.load();
    await s.load();
    await s.load();

    const backups = (await fileSystem.readDirectory(`${ROOT}/.clutter`)).filter((e) =>
      e.name.includes('.corrupt-')
    );
    expect(backups).toHaveLength(1);
  });

  it('keeps valid entries when only some are invalid', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"tags":{"good":{"icon":"✅"},"bad":7}}');

    expect([...(await store().load()).keys()]).toEqual(['good']);
  });

  it('an unreadable file does not fail the load, and blocks overwriting what could not be read', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"tags":{"design":{}}}');
    const failing: VaultFileSystem = Object.create(fileSystem);
    failing.readFile = async () => {
      throw new Error('EIO');
    };
    const s = store(failing);

    expect((await s.load()).size).toBe(0);
    await expect(s.update((m) => m)).rejects.toThrow(/read-only/);
    expect(await fileSystem.readFile(PATH)).toBe('{"tags":{"design":{}}}');
  });

  it('a failed backup blocks writes so the corrupt original is never overwritten', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, 'garbage');
    const failing: VaultFileSystem = Object.create(fileSystem);
    failing.writeFile = async () => {
      throw new Error('disk full');
    };
    const s = store(failing);

    expect((await s.load()).size).toBe(0);
    await expect(s.update(() => new Map([['a', {}]]))).rejects.toThrow(/read-only/);
    expect(await fileSystem.readFile(PATH)).toBe('garbage');
  });

  it('becomes writable again once the file is repaired', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, 'garbage');
    const failing: VaultFileSystem = Object.create(fileSystem);
    let failWrites = true;
    failing.writeFile = (p, c) =>
      failWrites ? Promise.reject(new Error('disk full')) : fileSystem.writeFile(p, c);
    const s = store(failing);

    await s.load();
    await fileSystem.writeFile(PATH, '{"tags":{}}');
    failWrites = false;

    await expect(s.update(() => new Map([['a', {}]]))).resolves.toBeDefined();
  });
});

describe('TagMetadataStore.update', () => {
  it('creates .clutter and the file on first write, as versioned deterministic JSON', async () => {
    await store().update(() => new Map([['design', { icon: '🎨' }]]));

    expect(await fileSystem.readFile(PATH)).toBe(
      '{\n  "version": 2,\n  "tags": {\n    "design": {\n      "icon": "🎨"\n    }\n  }\n}\n'
    );
  });

  it('upgrades a v1 file to v2 on the first write', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"tags":{"design":{"icon":"🎨"}}}');

    await store().update((m) => m);

    expect(JSON.parse(await fileSystem.readFile(PATH)).version).toBe(2);
  });

  it('writes nothing when the result is byte-identical', async () => {
    const s = store();
    await s.update(() => new Map([['design', {}]]));
    const writes: string[] = [];
    const spying: VaultFileSystem = Object.create(fileSystem);
    spying.writeFile = (p, c) => {
      writes.push(p);
      return fileSystem.writeFile(p, c);
    };

    await store(spying).update((m) => m);

    expect(writes).toEqual([]);
  });

  it('is atomic: writes a temp file and renames it, leaving no temp behind', async () => {
    const calls: string[] = [];
    const spying: VaultFileSystem = Object.create(fileSystem);
    spying.writeFile = (p, c) => {
      calls.push(`write ${p}`);
      return fileSystem.writeFile(p, c);
    };
    spying.moveFile = (a, b) => {
      calls.push(`move ${a} -> ${b}`);
      return fileSystem.moveFile(a, b);
    };

    await store(spying).update(() => new Map([['design', {}]]));

    expect(calls).toEqual([`write ${PATH}.tmp`, `move ${PATH}.tmp -> ${PATH}`]);
    expect(await fileSystem.exists(`${PATH}.tmp`)).toBe(false);
  });

  it('a write failure leaves the previous file intact and cleans up the temp file', async () => {
    const s = store();
    await s.update(() => new Map([['design', { icon: '🎨' }]]));
    const before = await fileSystem.readFile(PATH);
    const failing: VaultFileSystem = Object.create(fileSystem);
    failing.moveFile = async () => {
      throw new Error('EACCES');
    };

    await expect(store(failing).update(() => new Map([['other', {}]]))).rejects.toThrow('EACCES');

    expect(await fileSystem.readFile(PATH)).toBe(before);
    expect(await fileSystem.exists(`${PATH}.tmp`)).toBe(false);
  });

  it('a failed update does not wedge later updates', async () => {
    const s = store();

    await expect(
      s.update(() => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    await expect(s.update(() => new Map([['ok', {}]]))).resolves.toBeDefined();
  });

  it('concurrent updates serialize: none is lost', async () => {
    const s = store();

    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((name) =>
        s.update((current) => new Map([...current, [name, {}]]))
      )
    );

    expect([...(await s.load()).keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('applies the mutation to the file as it is on disk now, not a boot-time snapshot (external edit between updates is kept)', async () => {
    const s = store();
    await s.update(() => new Map([['a', {}]]));
    await fileSystem.writeFile(PATH, '{"version":2,"tags":{"a":{},"external":{"icon":"🧑"}}}');

    await s.update((current) => new Map([...current, ['b', {}]]));

    expect([...(await s.load()).keys()].sort()).toEqual(['a', 'b', 'external']);
  });

  it('preserves fields it does not understand', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, '{"version":2,"tags":{"design":{"icon":"🎨","color":"purple"}}}');

    await store().update((current) => new Map([...current, ['other', {}]]));

    expect(JSON.parse(await fileSystem.readFile(PATH)).tags.design).toEqual({ icon: '🎨', color: 'purple' });
  });

  it('replaces a corrupt file only after backing it up', async () => {
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(PATH, 'garbage');

    await store().update(() => new Map([['design', {}]]));

    expect(await fileSystem.readFile(`${PATH}.corrupt-1700000000000`)).toBe('garbage');
    expect(JSON.parse(await fileSystem.readFile(PATH)).tags).toEqual({ design: {} });
  });
});
