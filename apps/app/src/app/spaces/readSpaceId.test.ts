import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { readSpaceIdFrom } from './readSpaceId';

const STATE = '/s/Notes/.clutter/workspace.json';

describe('readSpaceIdFrom', () => {
  it('reads the id the folder carries', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [STATE]: JSON.stringify({ space: { version: 1, id: 'space-1' } }) });
    expect(await readSpaceIdFrom(fileSystem, '/s/Notes')).toBe('space-1');
  });

  it('is null for a folder with no profile: no file, or a file without an id', async () => {
    expect(await readSpaceIdFrom(new InMemoryVaultFileSystem(), '/s/Notes')).toBeNull();
    expect(await readSpaceIdFrom(new InMemoryVaultFileSystem({ [STATE]: '{}' }), '/s/Notes')).toBeNull();
    expect(await readSpaceIdFrom(new InMemoryVaultFileSystem({ [STATE]: 'not json' }), '/s/Notes')).toBeNull();
  });

  it('is "unreadable", never "no profile", when the read itself fails', async () => {
    class Unreadable extends InMemoryVaultFileSystem {
      override async readFile(): Promise<string> {
        throw new Error('Permission denied (os error 13)');
      }
    }
    expect(await readSpaceIdFrom(new Unreadable({ [STATE]: '{}' }), '/s/Notes')).toBe('unreadable');
  });

  it('never writes', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await readSpaceIdFrom(fileSystem, '/s/Notes');
    expect(await fileSystem.exists(STATE)).toBe(false);
  });
});
