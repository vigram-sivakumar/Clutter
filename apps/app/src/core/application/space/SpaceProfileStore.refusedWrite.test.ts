import { describe, expect, it, vi } from 'vitest';

import { AtomicNotCommittedError } from '../../vault/atomicWrite/atomicWriteErrors';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { SpaceProfileStore } from './SpaceProfileStore';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;
const REFUSED = () => new AtomicNotCommittedError('metadataPreservationFailed', 'the file flags were not preserved');

/** A filesystem whose every write is refused the way the native writer refuses (nothing is written). */
function refusingFileSystem(files: Record<string, string>) {
  const fileSystem = new InMemoryVaultFileSystem(files);
  const attempts = vi.spyOn(fileSystem, 'writeFile').mockImplementation(async () => {
    throw REFUSED();
  });

  return { fileSystem, attempts };
}

describe('a Space profile write that the native writer refuses (metadataPreservationFailed)', () => {
  it('is one write attempt per request: nothing in the store retries', async () => {
    const { fileSystem, attempts } = refusingFileSystem({ [FILE]: '{"space":{"version":1,"id":"a"}}' });
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    await expect(store.setAvatar({ type: 'emoji', emoji: '🌿' })).rejects.toBeInstanceOf(AtomicNotCommittedError);

    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it('a Space with no identity yet fails at the identity write, once, and never reaches the avatar write', async () => {
    const { fileSystem, attempts } = refusingFileSystem({});
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    await expect(store.setAvatar({ type: 'emoji', emoji: '🌿' })).rejects.toBeInstanceOf(AtomicNotCommittedError);

    expect(attempts).toHaveBeenCalledTimes(1);
  });

  it('each further request is its own attempt, so N requests are N attempts and N reports', async () => {
    const { fileSystem, attempts } = refusingFileSystem({ [FILE]: '{"space":{"version":1,"id":"a"}}' });
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    for (const emoji of ['🌿', '🔥', '🌊']) {
      await expect(store.setAvatar({ type: 'emoji', emoji })).rejects.toBeInstanceOf(AtomicNotCommittedError);
    }

    expect(attempts).toHaveBeenCalledTimes(3);
  });
});
