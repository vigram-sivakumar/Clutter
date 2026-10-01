import { describe, expect, it } from 'vitest';

import { mergeAndWriteWorkspaceStateFile } from './workspaceStateFile';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/**
 * An in-memory filesystem whose reads yield to the event loop before
 * resolving — the slow-disk shape under which two unserialized
 * read-merge-writes interleave (both read the same base, the later write
 * reinstates the other's stale key).
 */
class SlowReadFileSystem extends InMemoryVaultFileSystem {
  override async readFile(path: string): Promise<string> {
    const contents = await super.readFile(path);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return contents;
  }
}

async function readWorkspaceFile(fileSystem: InMemoryVaultFileSystem): Promise<Record<string, unknown>> {
  return JSON.parse(await fileSystem.readFile(WORKSPACE_PATH)) as Record<string, unknown>;
}

describe('mergeAndWriteWorkspaceStateFile', () => {
  it('concurrent writers of different keys never clobber each other (ADR-035 write queue)', async () => {
    const fileSystem = new SlowReadFileSystem({ [WORKSPACE_PATH]: '{}' });

    await Promise.all([
      mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { a: 1 }),
      mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 }),
      mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { c: 3 }),
    ]);

    expect(await readWorkspaceFile(fileSystem)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('applies writes in call order — a later write of the same key wins', async () => {
    const fileSystem = new SlowReadFileSystem({ [WORKSPACE_PATH]: '{}' });

    await Promise.all([
      mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { a: 'first' }),
      mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { a: 'second' }),
    ]);

    expect(await readWorkspaceFile(fileSystem)).toEqual({ a: 'second' });
  });

  it('a failed write rejects for its own caller but does not block later writes', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{}' });
    const failing = {
      ...fileSystem,
      exists: fileSystem.exists.bind(fileSystem),
      createDirectory: fileSystem.createDirectory.bind(fileSystem),
      readFile: fileSystem.readFile.bind(fileSystem),
      writeFile: () => Promise.reject(new Error('disk full')),
    } as unknown as InMemoryVaultFileSystem;

    await expect(mergeAndWriteWorkspaceStateFile(failing, ROOT, { a: 1 })).rejects.toThrow(
      'disk full'
    );
    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { b: 2 });

    expect(await readWorkspaceFile(fileSystem)).toEqual({ b: 2 });
  });

  it('preserves unrelated keys already on disk', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({ foldState: { p1: { doc: 'x', fold: [] } } }),
    });

    await mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { tagExpansion: ['design'] });

    expect(await readWorkspaceFile(fileSystem)).toEqual({
      foldState: { p1: { doc: 'x', fold: [] } },
      tagExpansion: ['design'],
    });
  });
});
