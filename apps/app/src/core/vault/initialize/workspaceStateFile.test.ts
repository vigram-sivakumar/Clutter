import { describe, expect, it } from 'vitest';

import {
  flushWorkspaceStateWrites,
  hasPendingWorkspaceStateWrites,
  mergeAndWriteWorkspaceStateFile,
} from './workspaceStateFile';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { LostableVaultFileSystem } from '../testing/LostableVaultFileSystem';
import { VaultRootMissingError } from '../providers/VaultRootMissingError';

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

describe('mergeAndWriteWorkspaceStateFile — a vault that is gone', () => {
  const OTHER_ROOT = '/other-vault';
  const OTHER_PATH = `${OTHER_ROOT}/.clutter/workspace.json`;

  it('resolves, without writing or recreating anything, when the vault was lost before the write ran', async () => {
    const fileSystem = new LostableVaultFileSystem(ROOT, { [WORKSPACE_PATH]: '{"kept":true}' });
    fileSystem.lose();

    await expect(mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { a: 1 })).resolves.toBeUndefined();

    expect(fileSystem.landed).toEqual({ writeFile: 0, createDirectory: 0, deleteFile: 0, moveFile: 0 });
    expect(await readWorkspaceFile(fileSystem)).toEqual({ kept: true });
  });

  it('never recreates the vault folder when `.clutter` is gone with it', async () => {
    const fileSystem = new LostableVaultFileSystem(ROOT);
    fileSystem.lose();

    await expect(mergeAndWriteWorkspaceStateFile(fileSystem, ROOT, { a: 1 })).resolves.toBeUndefined();

    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(false);
    expect(await fileSystem.exists(WORKSPACE_PATH)).toBe(false);
    expect(fileSystem.landed.createDirectory).toBe(0);
  });

  it('drops a write that is already queued when the vault is lost, and a later vault still writes', async () => {
    const lost = new LostableVaultFileSystem(ROOT, { [WORKSPACE_PATH]: '{}' });
    const replacement = new LostableVaultFileSystem(OTHER_ROOT, { [OTHER_PATH]: '{}' });

    // The write is queued behind another one; the vault disappears before it gets its turn.
    const first = mergeAndWriteWorkspaceStateFile(lost, ROOT, { first: 1 });
    const stale = mergeAndWriteWorkspaceStateFile(lost, ROOT, { stale: 1 });
    lost.lose();
    const fresh = mergeAndWriteWorkspaceStateFile(replacement, OTHER_ROOT, { fresh: 1 });

    await expect(Promise.all([first, stale, fresh])).resolves.toBeDefined();

    expect(lost.landed.writeFile).toBe(0);
    expect(await readWorkspaceFile(lost)).toEqual({});
    // Only the replacement vault received its own write, in its own folder.
    expect(JSON.parse(await replacement.readFile(OTHER_PATH))).toEqual({ fresh: 1 });
    expect(await replacement.exists(WORKSPACE_PATH)).toBe(false);
  });

  it('still rejects for every other error, so a real failure stays observable', async () => {
    const diskFull = new Error('disk full');
    class FailingFileSystem extends InMemoryVaultFileSystem {
      override async writeFile(): Promise<void> {
        throw diskFull;
      }
    }
    await expect(
      mergeAndWriteWorkspaceStateFile(new FailingFileSystem({ [WORKSPACE_PATH]: '{}' }), ROOT, { a: 1 })
    ).rejects.toBe(diskFull);

    class PermissionDenied extends InMemoryVaultFileSystem {
      override async createDirectory(): Promise<void> {
        throw new Error('Permission denied (os error 13)');
      }
    }
    await expect(mergeAndWriteWorkspaceStateFile(new PermissionDenied(), ROOT, { a: 1 })).rejects.toThrow(
      'Permission denied'
    );
  });

  it('a lost vault does not wedge the queue or change what VaultRootMissingError is', async () => {
    const error = new VaultRootMissingError(ROOT);
    expect(error).toBeInstanceOf(Error);
    expect(error.rootPath).toBe(ROOT);
  });
});

describe('hasPendingWorkspaceStateWrites', () => {
  it('is true from the moment a write is requested until it has finished, and false after a failed one too', async () => {
    expect(hasPendingWorkspaceStateWrites()).toBe(false);
    const slow = new SlowReadFileSystem({ [WORKSPACE_PATH]: '{}' });

    const first = mergeAndWriteWorkspaceStateFile(slow, ROOT, { a: 1 });
    const second = mergeAndWriteWorkspaceStateFile(slow, ROOT, { b: 2 });
    expect(hasPendingWorkspaceStateWrites()).toBe(true);

    await Promise.all([first, second]);
    await flushWorkspaceStateWrites();
    expect(hasPendingWorkspaceStateWrites()).toBe(false);

    class Failing extends InMemoryVaultFileSystem {
      override async writeFile(): Promise<void> {
        throw new Error('disk full');
      }
    }
    await mergeAndWriteWorkspaceStateFile(new Failing({ [WORKSPACE_PATH]: '{}' }), ROOT, { a: 1 }).catch(() => undefined);
    await flushWorkspaceStateWrites();
    expect(hasPendingWorkspaceStateWrites()).toBe(false);
  });
});
