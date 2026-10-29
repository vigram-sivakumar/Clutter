import { describe, expect, it } from 'vitest';
import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { mergeAndWriteWorkspaceStateFile } from './workspaceStateFile';

const ROOT = '/vault';
const FILE = `${ROOT}/.clutter/workspace.json`;

function setup(files: Record<string, string> = {}) {
  const disk = new InMemoryVaultFileSystem({ [`${ROOT}/.clutter/.keep`]: '', ...files });
  const writer = new InMemoryAtomicVaultWriter(disk);
  const fileSystem = new AtomicWriteFileSystem(disk, writer);

  return { disk, writer, fileSystem };
}

const corruptCopies = async (disk: InMemoryVaultFileSystem) =>
  (await disk.readDirectory(`${ROOT}/.clutter`)).filter((entry) => entry.name.startsWith('workspace.json.corrupt-'));

describe('workspace.json under the atomic provider (ADR-063, decision 14)', () => {
  it('merges a patch onto the file it read, replacing it only while it still holds that text', async () => {
    const { disk, writer, fileSystem } = setup({ [FILE]: '{"a":1}' });

    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 });

    expect(JSON.parse(await disk.readFile(FILE))).toEqual({ a: 1, b: 2 });
    expect(writer.calls).toContain(`write:replaceIfContent:${FILE}`);
  });

  it('creates the file when it is missing, as a create', async () => {
    const { disk, writer, fileSystem } = setup();

    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 });

    expect(JSON.parse(await disk.readFile(FILE))).toEqual({ b: 2 });
    expect(writer.calls).toContain(`write:create:${FILE}`);
  });

  it('keeps an unparsable file aside before replacing it, instead of silently resetting it', async () => {
    const { disk, fileSystem } = setup({ [FILE]: '{ not json' });

    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 });

    const copies = await corruptCopies(disk);
    expect(copies).toHaveLength(1);
    expect(await disk.readFile(copies[0]!.path)).toBe('{ not json');
    expect(JSON.parse(await disk.readFile(FILE))).toEqual({ b: 2 });
  });

  it('treats a file holding something other than an object the same way (kept aside, then replaced)', async () => {
    const { disk, fileSystem } = setup({ [FILE]: '[1,2,3]' });

    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 });

    expect(await corruptCopies(disk)).toHaveLength(1);
    expect(JSON.parse(await disk.readFile(FILE))).toEqual({ b: 2 });
  });

  it('writes nothing if the unreadable file cannot be kept aside', async () => {
    const { disk, writer, fileSystem } = setup({ [FILE]: '{ not json' });
    writer.inject({ kind: 'not-committed', reason: 'insufficientSpace' });

    await expect(mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 })).rejects.toMatchObject({ reason: 'insufficientSpace' });

    expect(await disk.readFile(FILE)).toBe('{ not json');
  });

  it('when another writer got in between, redoes the merge once from what is there now', async () => {
    const { disk, fileSystem } = setup({ [FILE]: '{"a":1}' });
    // The first conditional write finds the file changed: simulate by changing it during the first read-write gap.
    const read = disk.readFile.bind(disk);
    let reads = 0;
    disk.readFile = async (path: string) => {
      const text = await read(path);
      if (path === FILE && reads++ === 0) await disk.writeFile(FILE, '{"a":1,"other":true}');

      return text;
    };

    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 });

    expect(JSON.parse(await disk.readFile(FILE))).toEqual({ a: 1, other: true, b: 2 });
  });

  it('a provider that is not atomic behaves exactly as before: an unreadable file is replaced with no copy', async () => {
    const disk = new InMemoryVaultFileSystem({ [`${ROOT}/.clutter/.keep`]: '', [FILE]: '{ not json' });

    await mergeAndWriteWorkspaceStateFile(disk, ROOT, { b: 2 });

    expect(await corruptCopies(disk)).toHaveLength(0);
    expect(JSON.parse(await disk.readFile(FILE))).toEqual({ b: 2 });
  });
});
