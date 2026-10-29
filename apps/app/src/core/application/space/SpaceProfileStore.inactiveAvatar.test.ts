import { describe, expect, it, vi } from 'vitest';

import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { flushWorkspaceStateWrites } from '../../vault/initialize/workspaceStateFile';
import { readSpaceProfile, setSpaceProfileAvatar, SpaceProfileNotUnderstoodError } from './SpaceProfileStore';

// These exercise the isolated implementation over an in-memory file system. The real Tauri/atomic-write stack is
// not involved; see the report for what was and was not covered against it.
const ROOT = '/spaces/Beta';
const FILE = `${ROOT}/.clutter/workspace.json`;
const SOURCE = '/Users/me/Pictures/photo.png';

const space = (extra: Record<string, unknown> = {}) => ({ space: { version: 1, id: 'beta-id', ...extra } });
const disk = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));

function setup(initial: Record<string, unknown> | null = space()) {
  const fileSystem = new InMemoryVaultFileSystem(initial === null ? {} : { [FILE]: JSON.stringify(initial) });
  fileSystem.seedFile(SOURCE, 'PNG-BYTES');
  return fileSystem;
}

describe('setSpaceProfileAvatar — a Space that is not open', () => {
  it('sets an emoji, keeping the identity and every setting, and reads back after reload', async () => {
    const fileSystem = setup(space({ defaultCoverPosition: 'above', autoDeleteArchived: true }));

    await setSpaceProfileAvatar(fileSystem, ROOT, { type: 'emoji', emoji: '🍒' });

    expect((await disk(fileSystem)).space).toEqual({
      version: 1,
      id: 'beta-id',
      avatar: { type: 'emoji', emoji: '🍒' },
      defaultCoverPosition: 'above',
      autoDeleteArchived: true,
    });
    expect(await readSpaceProfile(fileSystem, ROOT)).toMatchObject({ id: 'beta-id', avatar: { type: 'emoji', emoji: '🍒' } });
  });

  it('keeps the other top-level keys of workspace.json', async () => {
    const fileSystem = setup({ ...space(), foldState: { a: true } });

    await setSpaceProfileAvatar(fileSystem, ROOT, { type: 'emoji', emoji: '🍒' });

    expect((await disk(fileSystem)).foldState).toEqual({ a: true });
  });

  it('copies an image into THIS Space’s Assets and stores that reference, after the copy succeeded', async () => {
    const fileSystem = setup();

    const profile = await setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE });

    expect(profile.avatar).toEqual({ type: 'image', src: 'Assets/photo.png' });
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe('PNG-BYTES');
    expect((await disk(fileSystem)).space.avatar).toEqual({ type: 'image', src: 'Assets/photo.png' });
  });

  it('names a colliding asset collision-free and leaves the existing one untouched', async () => {
    const fileSystem = setup();
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'SOMEONE-ELSES');

    const profile = await setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE });

    expect(profile.avatar).toEqual({ type: 'image', src: 'Assets/photo 2.png' });
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe('SOMEONE-ELSES');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo 2.png`)).toBe('PNG-BYTES');
  });

  it('gives a Space with no profile an identity, as the open Space does', async () => {
    const fileSystem = setup(null);

    const profile = await setSpaceProfileAvatar(fileSystem, ROOT, { type: 'emoji', emoji: '🍒' });

    expect(profile.id).not.toBe('');
    expect((await disk(fileSystem)).space).toMatchObject({ version: 1, id: profile.id, avatar: { type: 'emoji', emoji: '🍒' } });
  });

  it('removes the avatar without deleting the asset the old one used', async () => {
    const fileSystem = setup(space({ avatar: { type: 'image', src: 'Assets/old.png' } }));
    fileSystem.seedFile(`${ROOT}/Assets/old.png`, 'OLD');

    await setSpaceProfileAvatar(fileSystem, ROOT, null);

    expect((await disk(fileSystem)).space.avatar).toBeUndefined();
    expect(fileSystem.getFileSync(`${ROOT}/Assets/old.png`)).toBe('OLD');
  });

  it('writes only under its own root: another Space on the same machine is never touched', async () => {
    const beta = setup();
    const gammaFile = '/spaces/Gamma/.clutter/workspace.json';
    const gamma = new InMemoryVaultFileSystem({ [gammaFile]: JSON.stringify(space({ avatar: { type: 'emoji', emoji: '🌿' } })) });
    const gammaWrite = vi.spyOn(gamma, 'writeFile');
    const gammaCopy = vi.spyOn(gamma, 'copyFile');

    await setSpaceProfileAvatar(beta, ROOT, { type: 'image', sourcePath: SOURCE });

    expect(gammaWrite).not.toHaveBeenCalled();
    expect(gammaCopy).not.toHaveBeenCalled();
    expect(JSON.parse(await gamma.readFile(gammaFile)).space.avatar).toEqual({ type: 'emoji', emoji: '🌿' });
  });

  it('builds on the profile as it is when it writes, not as it was before the image was copied (stale write)', async () => {
    const fileSystem = setup(space());
    const copy = fileSystem.copyFile.bind(fileSystem);
    vi.spyOn(fileSystem, 'copyFile').mockImplementation(async (from, to) => {
      await copy(from, to);
      // Another writer changes a setting while the image is being stored.
      fileSystem.seedFile(FILE, JSON.stringify(space({ defaultCoverPosition: 'above' })));
    });

    await setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE });

    expect((await disk(fileSystem)).space).toMatchObject({ defaultCoverPosition: 'above', avatar: { type: 'image', src: 'Assets/photo.png' } });
  });

  it('two requests in a row each take effect in order, and the last one wins', async () => {
    const fileSystem = setup();

    await Promise.all([
      setSpaceProfileAvatar(fileSystem, ROOT, { type: 'emoji', emoji: '🍒' }),
      setSpaceProfileAvatar(fileSystem, ROOT, { type: 'emoji', emoji: '🌿' }),
    ]);
    await flushWorkspaceStateWrites();

    expect((await disk(fileSystem)).space.avatar).toEqual({ type: 'emoji', emoji: '🌿' });
  });
});

describe('setSpaceProfileAvatar — failures leave nothing half-saved', () => {
  it('a failed image copy rejects and the profile file is unchanged', async () => {
    const fileSystem = setup();
    const before = await fileSystem.readFile(FILE);
    vi.spyOn(fileSystem, 'copyFile').mockRejectedValue(new Error('disk full'));

    await expect(setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE })).rejects.toThrow('disk full');

    expect(await fileSystem.readFile(FILE)).toBe(before);
  });

  it('a failed profile write after the copy removes the image it created, and only that', async () => {
    const fileSystem = setup();
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'EXISTING');
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('write refused'));

    await expect(setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE })).rejects.toThrow('write refused');

    expect(fileSystem.hasFileSync(`${ROOT}/Assets/photo 2.png`)).toBe(false);
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe('EXISTING');
    expect(JSON.parse(fileSystem.getFileSync(FILE)!).space.avatar).toBeUndefined();
  });

  it('a failed cleanup does not hide the original failure', async () => {
    const fileSystem = setup();
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('write refused'));
    vi.spyOn(fileSystem, 'deleteFile').mockRejectedValue(new Error('cannot delete'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE })).rejects.toThrow('write refused');
  });

  it('an emoji write that fails rejects and creates no asset', async () => {
    const fileSystem = setup();
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('write refused'));

    await expect(setSpaceProfileAvatar(fileSystem, ROOT, { type: 'emoji', emoji: '🍒' })).rejects.toThrow('write refused');

    expect(fileSystem.hasFileSync(`${ROOT}/Assets/photo.png`)).toBe(false);
  });

  it('a profile written by a newer version is not rewritten, and the copied image is removed', async () => {
    const fileSystem = setup({ space: { version: 2, id: 'beta-id', somethingNew: true } });
    const before = await fileSystem.readFile(FILE);

    await expect(setSpaceProfileAvatar(fileSystem, ROOT, { type: 'image', sourcePath: SOURCE })).rejects.toBeInstanceOf(
      SpaceProfileNotUnderstoodError
    );

    expect(await fileSystem.readFile(FILE)).toBe(before);
    expect(fileSystem.hasFileSync(`${ROOT}/Assets/photo.png`)).toBe(false);
  });

  it.each([
    ['an empty emoji', { type: 'emoji', emoji: '' } as const],
    ['an image with no file', { type: 'image', sourcePath: '' } as const],
  ])('refuses %s before touching anything', async (_label, change) => {
    const fileSystem = setup();
    const write = vi.spyOn(fileSystem, 'writeFile');

    await expect(setSpaceProfileAvatar(fileSystem, ROOT, change)).rejects.toThrow();

    expect(write).not.toHaveBeenCalled();
  });
});
