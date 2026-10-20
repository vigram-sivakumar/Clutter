import { describe, expect, it, vi } from 'vitest';

import { SpaceProfileStore } from './SpaceProfileStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;
const reload = (fileSystem: InMemoryVaultFileSystem) => SpaceProfileStore.load(fileSystem, ROOT);
const persisted = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));

describe('SpaceProfileStore — the default note folder', () => {
  it('is Inbox (no folder) until one is chosen', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    expect(store.profile?.defaultNoteFolderId).toBeUndefined();
  });

  it('saves the chosen folder id in the Space profile and restores it after a restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    await store.setDefaultNoteFolder('folder-1');

    expect((await persisted(fileSystem)).space.defaultNoteFolderId).toBe('folder-1');
    expect((await reload(fileSystem)).profile?.defaultNoteFolderId).toBe('folder-1');
  });

  it('takes effect and notifies at once, before the file is written', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    const listener = vi.fn();
    store.subscribe(listener);

    const pending = store.setDefaultNoteFolder('folder-1');

    expect(store.profile?.defaultNoteFolderId).toBe('folder-1');
    expect(listener).toHaveBeenCalledTimes(1);
    await pending;
  });

  it('choosing Inbox again removes the saved folder and keeps the Space identity and avatar', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    await store.setAvatar({ type: 'emoji', emoji: '🌿' });
    const id = store.profile?.id;
    await store.setDefaultNoteFolder('folder-1');

    await store.setDefaultNoteFolder(undefined);

    expect(store.profile).toEqual({ id, avatar: { type: 'emoji', emoji: '🌿' } });
    expect((await persisted(fileSystem)).space.defaultNoteFolderId).toBeUndefined();
  });

  it('choosing Inbox in a Space with no profile writes nothing and gives it no identity', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    await store.setDefaultNoteFolder(undefined);

    expect(store.profile).toBeNull();
    await expect(fileSystem.readFile(FILE)).rejects.toThrow();
  });

  it('is kept when the avatar changes, and the avatar when the folder changes', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    await store.setDefaultNoteFolder('folder-1');
    await store.setAvatar({ type: 'emoji', emoji: '🌿' });
    expect(store.profile?.defaultNoteFolderId).toBe('folder-1');

    await store.setDefaultNoteFolder('folder-2');
    expect(store.profile?.avatar).toEqual({ type: 'emoji', emoji: '🌿' });

    await store.setAvatar(undefined);
    expect(store.profile?.defaultNoteFolderId).toBe('folder-2');
  });

  it('reads a profile written before the setting existed unchanged', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [FILE]: JSON.stringify({ space: { version: 1, id: 'space-1', avatar: { type: 'emoji', emoji: '🌿' } } }),
    });
    expect((await reload(fileSystem)).profile).toEqual({ id: 'space-1', avatar: { type: 'emoji', emoji: '🌿' } });
  });

  it('ignores a malformed saved value', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [FILE]: JSON.stringify({ space: { version: 1, id: 'space-1', defaultNoteFolderId: 7 } }),
    });
    expect((await reload(fileSystem)).profile).toEqual({ id: 'space-1' });
  });

  it('is independent per Space: each Space file has its own', async () => {
    const a = new InMemoryVaultFileSystem();
    const b = new InMemoryVaultFileSystem();
    await (await reload(a)).setDefaultNoteFolder('folder-a');
    await (await reload(b)).setDefaultNoteFolder('folder-b');

    expect((await reload(a)).profile?.defaultNoteFolderId).toBe('folder-a');
    expect((await reload(b)).profile?.defaultNoteFolderId).toBe('folder-b');
  });
});
