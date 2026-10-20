import { describe, expect, it, vi } from 'vitest';

import { SpaceProfileStore } from './SpaceProfileStore';
import { PreferredTemplatesStore } from '../templates/PreferredTemplatesStore';
import { flushWorkspaceStateWrites } from '../../vault/initialize/workspaceStateFile';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;
const withFile = (contents: unknown) =>
  new InMemoryVaultFileSystem({ [FILE]: typeof contents === 'string' ? contents : JSON.stringify(contents) });
const reload = (fileSystem: InMemoryVaultFileSystem) => SpaceProfileStore.load(fileSystem, ROOT);
const persisted = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));
const profile = (extra: Record<string, unknown>) => ({ space: { version: 1, id: 'space-1', ...extra } });

describe('Space settings in the Space profile — defaults', () => {
  it('a Space that never chose has Right as the cover position, and automatic cleanup OFF', async () => {
    const empty = await reload(new InMemoryVaultFileSystem());
    expect(empty.profile).toBeNull();

    const existing = await reload(withFile(profile({})));
    expect(existing.profile?.defaultCoverPosition).toBeUndefined();
    expect(existing.profile?.autoDeleteArchived).toBeUndefined();
  });

  it.each([
    ['a string "true"', 'true'],
    ['the number 1', 1],
    ['an object', { enabled: true }],
    ['false', false],
    ['null', null],
  ])('automatic cleanup is never on from %s: only a literal true turns it on', async (_label, value) => {
    const store = await reload(withFile(profile({ autoDeleteArchived: value })));
    expect(store.profile?.autoDeleteArchived).toBeUndefined();
  });

  it.each(['top', 'right', '', 1, null, ['above'], 'ABOVE'])(
    'an unusable cover position (%j) reads as never chosen',
    async (value) => {
      const store = await reload(withFile(profile({ defaultCoverPosition: value })));
      expect(store.profile?.defaultCoverPosition).toBeUndefined();
    }
  );

  it('invalid JSON or a non-object file reads as an empty Space, without throwing', async () => {
    expect((await reload(withFile('{ not json'))).profile).toBeNull();
    expect((await reload(withFile('[]'))).profile).toBeNull();
  });
});

describe('Space settings in the Space profile — persistence', () => {
  it('the cover position is saved in the Space file and restored on reopening', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await (await reload(fileSystem)).setDefaultCoverPosition('above');

    expect((await persisted(fileSystem)).space.defaultCoverPosition).toBe('above');
    expect((await reload(fileSystem)).profile?.defaultCoverPosition).toBe('above');
  });

  it('a chosen Right is saved explicitly, so it can be told from never having chosen', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    await store.setDefaultCoverPosition('above');
    await store.setDefaultCoverPosition('side');

    expect((await persisted(fileSystem)).space.defaultCoverPosition).toBe('side');
    expect((await reload(fileSystem)).profile?.defaultCoverPosition).toBe('side');
  });

  it('automatic cleanup is saved only when on, and turning it off removes it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    await store.setAutoDeleteArchived(true);
    expect((await persisted(fileSystem)).space.autoDeleteArchived).toBe(true);
    expect((await reload(fileSystem)).profile?.autoDeleteArchived).toBe(true);

    await store.setAutoDeleteArchived(false);
    expect((await persisted(fileSystem)).space.autoDeleteArchived).toBeUndefined();
    expect((await reload(fileSystem)).profile?.autoDeleteArchived).toBeUndefined();
  });

  it('turning cleanup off in a Space with no profile writes nothing and gives the Space no identity', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    await store.setAutoDeleteArchived(false);

    expect(store.profile).toBeNull();
    await expect(fileSystem.readFile(FILE)).rejects.toThrow();
  });

  it('choosing what is already chosen changes nothing and writes nothing', async () => {
    const fileSystem = withFile(profile({ defaultCoverPosition: 'above', autoDeleteArchived: true }));
    const store = await reload(fileSystem);
    const listener = vi.fn();
    store.subscribe(listener);
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    await store.setDefaultCoverPosition('above');
    await store.setAutoDeleteArchived(true);

    expect(listener).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('keeps the Space identity, avatar and the other settings when one setting changes', async () => {
    const fileSystem = withFile(
      profile({ avatar: { type: 'emoji', emoji: '🌿' }, defaultNoteFolderId: 'f1', autoDeleteArchived: true })
    );
    const store = await reload(fileSystem);

    await store.setDefaultCoverPosition('above');
    await store.setAvatar(undefined);

    const saved = (await persisted(fileSystem)).space;
    expect(saved).toEqual({
      version: 1,
      id: 'space-1',
      defaultNoteFolderId: 'f1',
      autoDeleteArchived: true,
      defaultCoverPosition: 'above',
    });
  });

  it("keeps the rest of the workspace file: other stores' keys are never clobbered", async () => {
    const fileSystem = withFile({
      ...profile({}),
      foldState: { note: [1, 2] },
      templateUsage: { t: { lastUsedAt: 5 } },
      preferredTemplates: ['a'],
    });
    const store = await reload(fileSystem);

    await store.setDefaultCoverPosition('above');
    await store.setAutoDeleteArchived(true);

    const file = await persisted(fileSystem);
    expect(file.foldState).toEqual({ note: [1, 2] });
    expect(file.templateUsage).toEqual({ t: { lastUsedAt: 5 } });
    expect(file.preferredTemplates).toEqual(['a']);
  });

  it('applies at once in memory and notifies, before the file is written', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    const listener = vi.fn();
    store.subscribe(listener);

    const pending = store.setDefaultCoverPosition('above');

    expect(store.profile?.defaultCoverPosition).toBe('above');
    expect(listener).toHaveBeenCalledTimes(1);
    await pending;
  });
});

describe('Space settings — settings changed close together', () => {
  it('every one of several changes made without waiting reaches the file, in the profile and in the templates', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const profileStore = await reload(fileSystem);
    const templates = await PreferredTemplatesStore.load(fileSystem, ROOT);

    // None of these is awaited: they are queued one behind another and each builds on the one before.
    void profileStore.setDefaultCoverPosition('above');
    void profileStore.setAutoDeleteArchived(true);
    void profileStore.setDefaultNoteFolder('folder-1');
    templates.add('t-notes', 'notes');
    templates.add('t-daily', 'dailyNotes');
    templates.setDefaultDailyNoteTemplate('t-default');
    void profileStore.setDefaultCoverPosition('side');
    await flushWorkspaceStateWrites();

    const reopenedProfile = await reload(fileSystem);
    const reopenedTemplates = await PreferredTemplatesStore.load(fileSystem, ROOT);
    expect(reopenedProfile.profile).toMatchObject({
      defaultCoverPosition: 'side', // the last change wins
      autoDeleteArchived: true,
      defaultNoteFolderId: 'folder-1',
    });
    expect(reopenedTemplates.getIds('notes')).toEqual(['t-notes']);
    expect(reopenedTemplates.getIds('dailyNotes')).toEqual(['t-daily']);
    expect(reopenedTemplates.getDefaultDailyNoteTemplateId()).toBe('t-default');
  });

  it('flushWorkspaceStateWrites waits for a slow write: a setting changed just before quitting is not lost', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    const realWrite = fileSystem.writeFile.bind(fileSystem);
    vi.spyOn(fileSystem, 'writeFile').mockImplementation(async (path, contents) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return realWrite(path, contents);
    });

    void store.setAutoDeleteArchived(true);
    // Not written yet — the write is still in flight.
    await expect(fileSystem.readFile(FILE)).rejects.toThrow();

    await flushWorkspaceStateWrites();

    expect((await persisted(fileSystem)).space.autoDeleteArchived).toBe(true);
  });
});

describe('Space settings — failed writes', () => {
  const failingWrites = (fileSystem: InMemoryVaultFileSystem) =>
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('disk is full'));

  it('reports a failed write instead of pretending it was saved, and does not throw at the caller', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    const onError = vi.fn();
    store.subscribeWriteError(onError);
    failingWrites(fileSystem);

    await expect(store.setAutoDeleteArchived(true)).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('disk is full');
    // It holds for this session — and was reported as not saved, which is what the user is told.
    expect(store.profile?.autoDeleteArchived).toBe(true);
    expect((await reload(fileSystem)).profile).toBeNull();
  });

  it('every kind of setting write reports a failure: cover position, cleanup and the default note folder', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    const onError = vi.fn();
    store.subscribeWriteError(onError);
    failingWrites(fileSystem);

    await store.setDefaultCoverPosition('above');
    await store.setAutoDeleteArchived(true);
    await store.setDefaultNoteFolder('folder-1');

    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('a failed write does not wedge later ones: the next change is saved once writes work again', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    store.subscribeWriteError(() => {});
    const failing = failingWrites(fileSystem);

    await store.setDefaultCoverPosition('above');
    failing.mockRestore();
    await store.setAutoDeleteArchived(true);

    // The later write carries the whole profile, so the earlier change reaches the file with it.
    const saved = (await persisted(fileSystem)).space;
    expect(saved.autoDeleteArchived).toBe(true);
    expect(saved.defaultCoverPosition).toBe('above');
  });

  it('the avatar flows still reject on a failed write, as they always did', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    failingWrites(fileSystem);

    await expect(store.ensureIdentity()).rejects.toThrow('disk is full');
  });

  it('a failed write of a template choice is reported too, not left as an unhandled rejection', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const templates = await PreferredTemplatesStore.load(fileSystem, ROOT);
    const onError = vi.fn();
    templates.subscribeWriteError(onError);
    failingWrites(fileSystem);

    templates.add('t', 'notes');
    await flushWorkspaceStateWrites();
    await new Promise((resolve) => setTimeout(resolve, 0)); // the error handler runs just after the queue settles

    expect(onError).toHaveBeenCalledTimes(1);
    expect(templates.getIds('notes')).toEqual(['t']);
  });

  it('stops reporting to a listener that unsubscribed', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    const onError = vi.fn();
    const unsubscribe = store.subscribeWriteError(onError);
    unsubscribe();
    failingWrites(fileSystem);

    await store.setAutoDeleteArchived(true);

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('Space settings — independent Spaces', () => {
  it("each Space's file holds its own values; reopening either restores its own", async () => {
    const one = new InMemoryVaultFileSystem();
    const two = new InMemoryVaultFileSystem();
    const first = await reload(one);
    const second = await reload(two);

    await first.setDefaultCoverPosition('above');
    await first.setAutoDeleteArchived(true);
    await second.setDefaultCoverPosition('side');

    const reopenedOne = await reload(one);
    const reopenedTwo = await reload(two);
    expect(reopenedOne.profile).toMatchObject({ defaultCoverPosition: 'above', autoDeleteArchived: true });
    expect(reopenedTwo.profile?.defaultCoverPosition).toBe('side');
    // Turning cleanup on in one Space never turns it on in another.
    expect(reopenedTwo.profile?.autoDeleteArchived).toBeUndefined();
  });

  it('switching away and back restores the first Space exactly', async () => {
    const one = new InMemoryVaultFileSystem();
    const two = new InMemoryVaultFileSystem();
    await (await reload(one)).setDefaultCoverPosition('above');
    await (await reload(two)).setDefaultCoverPosition('side');

    // Space two is opened and changed; then Space one is opened again.
    const secondAgain = await reload(two);
    await secondAgain.setAutoDeleteArchived(true);
    const firstAgain = await reload(one);

    expect(firstAgain.profile?.defaultCoverPosition).toBe('above');
    expect(firstAgain.profile?.autoDeleteArchived).toBeUndefined();
  });

  it('a Space folder that is copied carries its settings with it', async () => {
    const original = new InMemoryVaultFileSystem();
    await (await reload(original)).setDefaultCoverPosition('above');
    const copy = withFile(await persisted(original));

    expect((await reload(copy)).profile?.defaultCoverPosition).toBe('above');
  });
});
