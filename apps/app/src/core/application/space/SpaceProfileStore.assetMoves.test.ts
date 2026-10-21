import { describe, expect, it } from 'vitest';

import { SpaceProfileStore } from './SpaceProfileStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;
const withFile = (contents: unknown) =>
  new InMemoryVaultFileSystem({ [FILE]: typeof contents === 'string' ? contents : JSON.stringify(contents) });
const reload = (fileSystem: InMemoryVaultFileSystem) => SpaceProfileStore.load(fileSystem, ROOT);
const persisted = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));
const profile = (extra: Record<string, unknown>) => ({ space: { version: 1, id: 'space-1', ...extra } });

describe('moving assets into folders, in the Space profile', () => {
  it('is off by default: a Space with no profile, or a profile that never chose, has it off', async () => {
    expect((await reload(new InMemoryVaultFileSystem())).profile).toBeNull();
    expect((await reload(withFile(profile({})))).profile?.allowMovingAssetsToFolders).toBeUndefined();
  });

  it.each([
    ['a string "true"', 'true'],
    ['the number 1', 1],
    ['an object', { enabled: true }],
    ['false', false],
    ['null', null],
  ])('is never on from %s: only a literal true turns it on', async (_label, value) => {
    const store = await reload(withFile(profile({ allowMovingAssetsToFolders: value })));
    expect(store.profile?.allowMovingAssetsToFolders).toBeUndefined();
  });

  it('is saved in the Space file when turned on, restored on reopening, and removed again when turned off', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    await store.setAllowMovingAssetsToFolders(true);
    expect((await persisted(fileSystem)).space.allowMovingAssetsToFolders).toBe(true);
    expect((await reload(fileSystem)).profile?.allowMovingAssetsToFolders).toBe(true);

    await store.setAllowMovingAssetsToFolders(false);
    expect('allowMovingAssetsToFolders' in (await persisted(fileSystem)).space).toBe(false);
    expect((await reload(fileSystem)).profile?.allowMovingAssetsToFolders).toBeUndefined();
  });

  it('writes nothing when it is already as asked, off included', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    await store.setAllowMovingAssetsToFolders(false);

    expect(await fileSystem.exists(FILE)).toBe(false);
  });

  it('keeps the Space’s identity and its other settings, and they keep it', async () => {
    const fileSystem = withFile(
      profile({ avatar: { type: 'emoji', emoji: '🌿' }, defaultCoverPosition: 'above', autoDeleteArchived: true })
    );
    const store = await reload(fileSystem);

    await store.setAllowMovingAssetsToFolders(true);
    await store.setDefaultCoverPosition('side');
    await store.setAutoDeleteArchived(false);

    expect((await persisted(fileSystem)).space).toEqual({
      version: 1,
      id: 'space-1',
      avatar: { type: 'emoji', emoji: '🌿' },
      defaultCoverPosition: 'side',
      allowMovingAssetsToFolders: true,
    });
  });

  it('belongs to its own Space: turning it on in one leaves another Space’s file as it was', async () => {
    const first = withFile(profile({}));
    const second = withFile(profile({}));
    const secondBefore = await second.readFile(FILE);

    await (await reload(first)).setAllowMovingAssetsToFolders(true);

    expect((await reload(first)).profile?.allowMovingAssetsToFolders).toBe(true);
    expect((await reload(second)).profile?.allowMovingAssetsToFolders).toBeUndefined();
    expect(await second.readFile(FILE)).toBe(secondBefore);
  });
});
