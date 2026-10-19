import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { parseSpaceProfile, readSpaceProfile, SpaceProfileStore } from './SpaceProfileStore';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;

function withFile(contents: string): InMemoryVaultFileSystem {
  return new InMemoryVaultFileSystem({ [FILE]: contents });
}

async function fileContents(fileSystem: InMemoryVaultFileSystem): Promise<Record<string, unknown>> {
  return JSON.parse(await fileSystem.readFile(FILE)) as Record<string, unknown>;
}

describe('parseSpaceProfile', () => {
  it('reads an identity and an emoji or image avatar', () => {
    expect(parseSpaceProfile('{"space":{"version":1,"id":"a","avatar":{"type":"emoji","emoji":"🌿"}}}')).toEqual({
      id: 'a',
      avatar: { type: 'emoji', emoji: '🌿' },
    });
    expect(
      parseSpaceProfile('{"space":{"version":1,"id":"a","avatar":{"type":"image","src":"Assets/logo.png"}}}')
    ).toEqual({ id: 'a', avatar: { type: 'image', src: 'Assets/logo.png' } });
  });

  it.each([
    ['not json', '{nope'],
    ['no space key', '{"foldState":{}}'],
    ['not an object', '{"space":"x"}'],
    ['no id', '{"space":{"version":1}}'],
    ['an empty id', '{"space":{"version":1,"id":""}}'],
    ['a newer version', '{"space":{"version":99,"id":"a"}}'],
  ])('is no profile for %s', (_name, contents) => {
    expect(parseSpaceProfile(contents)).toBeNull();
  });

  it('drops a malformed avatar but keeps the identity', () => {
    expect(parseSpaceProfile('{"space":{"version":1,"id":"a","avatar":{"type":"emoji","emoji":""}}}')).toEqual({ id: 'a' });
    expect(parseSpaceProfile('{"space":{"version":1,"id":"a","avatar":{"type":"gif"}}}')).toEqual({ id: 'a' });
  });
});

describe('readSpaceProfile', () => {
  it('reads without writing or creating anything, for a folder that is not a Clutter Space', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    expect(await readSpaceProfile(fileSystem, ROOT)).toBeNull();
    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(false);
  });
});

describe('SpaceProfileStore', () => {
  it('loading is read-only: a Space with no identity stays untouched until asked', async () => {
    const fileSystem = withFile('{"foldState":{"p":[1]}}');

    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    expect(store.profile).toBeNull();
    expect(await fileContents(fileSystem)).toEqual({ foldState: { p: [1] } });
  });

  it('gives a Space without an identity one — the lazy migration — keeping the file’s other keys', async () => {
    const fileSystem = withFile('{"foldState":{"p":[1]}}');
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    const profile = await store.ensureIdentity();

    expect(profile.id).toMatch(/\S/);
    const written = await fileContents(fileSystem);
    expect(written.foldState).toEqual({ p: [1] });
    expect(written.space).toEqual({ version: 1, id: profile.id });
  });

  it('works on a folder with no .clutter at all, creating only what the write needs', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    const profile = await store.setAvatar({ type: 'emoji', emoji: '🚀' });

    expect((await fileContents(fileSystem)).space).toEqual({
      version: 1,
      id: profile.id,
      avatar: { type: 'emoji', emoji: '🚀' },
    });
  });

  it('keeps the same identity forever: ensuring or changing the avatar never re-issues it', async () => {
    const fileSystem = withFile('{"space":{"version":1,"id":"stable"}}');
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    expect((await store.ensureIdentity()).id).toBe('stable');
    expect((await store.setAvatar({ type: 'image', src: 'Assets/a.png' })).id).toBe('stable');
    expect((await store.setAvatar(undefined)).id).toBe('stable');
  });

  it('writes nothing when the Space already has an identity and ensureIdentity is called', async () => {
    const original = '{"space":{"version":1,"id":"stable"}}';
    const fileSystem = withFile(original);
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    await store.ensureIdentity();

    expect(await fileSystem.readFile(FILE)).toBe(original);
  });

  it('persists an emoji and an image reference, and removing the avatar removes it from the file', async () => {
    const fileSystem = withFile('{"space":{"version":1,"id":"s"}}');
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    await store.setAvatar({ type: 'emoji', emoji: '🌿' });
    expect(((await fileContents(fileSystem)).space as { avatar: unknown }).avatar).toEqual({
      type: 'emoji',
      emoji: '🌿',
    });

    await store.setAvatar({ type: 'image', src: 'Assets/logo.png' });
    expect(((await fileContents(fileSystem)).space as { avatar: unknown }).avatar).toEqual({
      type: 'image',
      src: 'Assets/logo.png',
    });

    await store.setAvatar(undefined);
    expect((await fileContents(fileSystem)).space).toEqual({ version: 1, id: 's' });
  });

  it('restores identity and avatar after a restart (a fresh load of the same folder)', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const first = await SpaceProfileStore.load(fileSystem, ROOT);
    const written = await first.setAvatar({ type: 'image', src: 'Assets/logo.png' });

    const restarted = await SpaceProfileStore.load(fileSystem, ROOT);

    expect(restarted.profile).toEqual(written);
  });

  it('travels with the folder: the same files read from another location give the same profile', async () => {
    const original = new InMemoryVaultFileSystem();
    const store = await SpaceProfileStore.load(original, ROOT);
    const written = await store.setAvatar({ type: 'emoji', emoji: '🌿' });
    const contents = await original.readFile(FILE);

    const moved = new InMemoryVaultFileSystem({ '/elsewhere/renamed/.clutter/workspace.json': contents });

    expect(await readSpaceProfile(moved, '/elsewhere/renamed')).toEqual(written);
  });
});
