import { describe, expect, it, vi } from 'vitest';

import { SpaceProfileStore, clearSpaceProfileSettings } from './SpaceProfileStore';
import { flushWorkspaceStateWrites } from '../../vault/initialize/workspaceStateFile';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;

/** Everything else a Space's file holds: view and layout state a settings reset must never touch. */
const OTHER_STATE = {
  collectionViewConfig: { 'view:notes': { layout: 'card', sort: { property: 'name', direction: 'up' } } },
  tasksViewConfig: { showCompleted: false, selectedTab: 'today' },
  tagExpansion: ['work'],
  workspaceSession: { version: 1, sidebar: { visible: false, collapsedSections: [], notes: { collapsedFolderIds: ['f1'] } } },
  foldState: { page1: ['h1'] },
};

const ALL_SETTINGS = {
  defaultNoteFolderId: 'folder-inbox-2',
  defaultCoverPosition: 'above',
  autoDeleteArchived: true,
  autoDeleteUnusedTags: true,
  allowMovingAssetsToFolders: true,
};

const AVATAR = { type: 'emoji', emoji: '🌊' };

const file = (space: Record<string, unknown> | undefined, other: Record<string, unknown> = OTHER_STATE) =>
  JSON.stringify({ ...(space && { space: { version: 1, id: 'space-1', avatar: AVATAR, ...space } }), ...other });
const withFile = (contents: string) => new InMemoryVaultFileSystem({ [FILE]: contents });
const persisted = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));
const withoutSpace = (parsed: Record<string, unknown>) => {
  const { space: _space, ...rest } = parsed;
  return rest;
};

describe('SpaceProfileStore.resetSettings — the open Space', () => {
  it('takes every setting out of the profile and keeps the identity and the avatar', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));
    const store = await SpaceProfileStore.load(fileSystem, ROOT);
    expect(store.profile).toMatchObject(ALL_SETTINGS);

    await store.resetSettings();

    expect(store.profile).toEqual({ id: 'space-1', avatar: AVATAR });
    expect((await persisted(fileSystem)).space).toEqual({ version: 1, id: 'space-1', avatar: AVATAR });
  });

  it('removes the settings rather than writing the defaults into the file', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    await store.resetSettings();

    const space = (await persisted(fileSystem)).space;
    for (const key of Object.keys(ALL_SETTINGS)) {
      expect(space).not.toHaveProperty(key);
    }
  });

  it('leaves every other key of the file exactly as it was — view and layout state are not settings', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));
    const store = await SpaceProfileStore.load(fileSystem, ROOT);

    await store.resetSettings();

    expect(withoutSpace(await persisted(fileSystem))).toEqual(OTHER_STATE);
  });

  it('reads the defaults straight away, and tells subscribers once', async () => {
    const store = await SpaceProfileStore.load(withFile(file(ALL_SETTINGS)), ROOT);
    const listener = vi.fn();
    store.subscribe(listener);

    const done = store.resetSettings();
    // In memory before the file: the UI does not wait for the write.
    expect(store.profile?.defaultCoverPosition).toBeUndefined();
    expect(store.profile?.autoDeleteArchived).toBeUndefined();
    await done;

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('persists: a Space reopened after the reset has the defaults, its identity and its avatar', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));
    const store = await SpaceProfileStore.load(fileSystem, ROOT);
    await store.resetSettings();
    await flushWorkspaceStateWrites();

    const reopened = await SpaceProfileStore.load(fileSystem, ROOT);

    expect(reopened.profile).toEqual({ id: 'space-1', avatar: AVATAR });
  });

  it('changes and writes nothing for a Space with no settings, or no profile at all', async () => {
    const noSettings = withFile(file({}));
    const noProfile = withFile(file(undefined));
    const writes = [vi.spyOn(noSettings, 'writeFile'), vi.spyOn(noProfile, 'writeFile')];

    const quiet = await SpaceProfileStore.load(noSettings, ROOT);
    const listener = vi.fn();
    quiet.subscribe(listener);
    await quiet.resetSettings();
    await (await SpaceProfileStore.load(noProfile, ROOT)).resetSettings();

    expect(writes[0]).not.toHaveBeenCalled();
    expect(writes[1]).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('puts the settings back and rejects when the file cannot be written, so memory and file agree', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));
    const store = await SpaceProfileStore.load(fileSystem, ROOT);
    const before = await fileSystem.readFile(FILE);
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('disk full'));
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.resetSettings()).rejects.toThrow('disk full');

    expect(store.profile).toMatchObject(ALL_SETTINGS);
    expect(await fileSystem.readFile(FILE)).toBe(before);
    // Told twice: once for the optimistic change, once for putting it back.
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('clearSpaceProfileSettings — a Space that is not open', () => {
  it('takes the settings out of its file, keeping its identity, avatar and every other key', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));

    expect(await clearSpaceProfileSettings(fileSystem, ROOT)).toBe(true);
    await flushWorkspaceStateWrites();

    const parsed = await persisted(fileSystem);
    expect(parsed.space).toEqual({ version: 1, id: 'space-1', avatar: AVATAR });
    expect(withoutSpace(parsed)).toEqual(OTHER_STATE);
  });

  it('writes nothing when there is no setting to take out, and never creates .clutter in a folder without one', async () => {
    const noSettings = withFile(file({}));
    const writeNoSettings = vi.spyOn(noSettings, 'writeFile');
    const empty = new InMemoryVaultFileSystem();
    const writeEmpty = vi.spyOn(empty, 'writeFile');

    expect(await clearSpaceProfileSettings(noSettings, ROOT)).toBe(false);
    expect(await clearSpaceProfileSettings(empty, ROOT)).toBe(false);

    expect(writeNoSettings).not.toHaveBeenCalled();
    expect(writeEmpty).not.toHaveBeenCalled();
    expect(await empty.exists(`${ROOT}/.clutter`)).toBe(false);
  });

  it('leaves a file it cannot understand exactly as it is', async () => {
    const fileSystem = withFile('{ not json');
    const write = vi.spyOn(fileSystem, 'writeFile');

    expect(await clearSpaceProfileSettings(fileSystem, ROOT)).toBe(false);

    expect(write).not.toHaveBeenCalled();
    expect(await fileSystem.readFile(FILE)).toBe('{ not json');
  });

  it('rejects when the file cannot be read, so the caller can say which Space was not reset', async () => {
    const fileSystem = withFile(file(ALL_SETTINGS));
    vi.spyOn(fileSystem, 'readFile').mockRejectedValue(new Error('permission denied'));

    await expect(clearSpaceProfileSettings(fileSystem, ROOT)).rejects.toThrow('permission denied');
  });
});
