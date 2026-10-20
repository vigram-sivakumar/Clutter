import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { SpaceProfileStore } from './space/SpaceProfileStore';
import { PreferredTemplatesStore } from './templates/PreferredTemplatesStore';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;
const savedFile = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));

/** A Space as the app opens it: its stores loaded from its own `.clutter/workspace.json`, then an Application over them. */
async function openSpace(fileSystem = new InMemoryVaultFileSystem()) {
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    { toLoadableUrl: (path: string) => path },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    await SpaceProfileStore.load(fileSystem, ROOT),
    await PreferredTemplatesStore.load(fileSystem, ROOT)
  );
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return { application, fileSystem };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Space settings through the Application — defaults', () => {
  it('a Space that never chose has Right as the cover position and automatic cleanup off', async () => {
    const { application } = await openSpace();

    expect(application.defaultCoverPosition).toBe('side');
    expect(application.autoDeleteArchived).toBe(false);
  });

  it('automatic cleanup never runs for a Space that did not turn it on, however it is asked', async () => {
    const { application } = await openSpace();
    const purge = vi.spyOn(application, 'purgeExpiredArchivedItems');

    await expect(application.runArchiveCleanupIfEnabled(new Date(2099, 0, 1))).resolves.toBe(0);

    expect(purge).not.toHaveBeenCalled();
  });

  it('runs once the Space turns it on, and stops again when the Space turns it off', async () => {
    const { application } = await openSpace();
    const purge = vi.spyOn(application, 'purgeExpiredArchivedItems').mockResolvedValue(0);

    await application.spaceProfileStore.setAutoDeleteArchived(true);
    await application.runArchiveCleanupIfEnabled();
    expect(purge).toHaveBeenCalledTimes(1);

    await application.spaceProfileStore.setAutoDeleteArchived(false);
    await application.runArchiveCleanupIfEnabled();
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('a file whose cleanup value is not a real true leaves cleanup off after reopening', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [FILE]: JSON.stringify({ space: { version: 1, id: 's', autoDeleteArchived: 'yes' } }),
    });
    const { application } = await openSpace(fileSystem);

    expect(application.autoDeleteArchived).toBe(false);
  });
});

describe('Space settings through the Application — surviving a restart', () => {
  it('every Space setting is restored when the Space is opened again', async () => {
    const first = await openSpace();
    await first.application.spaceProfileStore.setDefaultCoverPosition('above');
    await first.application.spaceProfileStore.setAutoDeleteArchived(true);
    first.application.preferredTemplatesStore.add('t-notes', 'notes');
    first.application.preferredTemplatesStore.add('t-daily', 'dailyNotes');
    first.application.preferredTemplatesStore.setDefaultDailyNoteTemplate('t-default');
    await settle();

    // A new Application over the same file: the app quit and was started again.
    const second = await openSpace(first.fileSystem);

    expect(second.application.defaultCoverPosition).toBe('above');
    expect(second.application.autoDeleteArchived).toBe(true);
    expect(second.application.preferredTemplatesStore.getIds('notes')).toEqual(['t-notes']);
    expect(second.application.preferredTemplatesStore.getIds('dailyNotes')).toEqual(['t-daily']);
    expect(second.application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBe('t-default');
  });

  it('closing the app right after a change still writes it: shutdown waits for settings writes', async () => {
    const { application, fileSystem } = await openSpace();
    const realWrite = fileSystem.writeFile.bind(fileSystem);
    vi.spyOn(fileSystem, 'writeFile').mockImplementation(async (path, contents) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return realWrite(path, contents);
    });

    void application.spaceProfileStore.setDefaultCoverPosition('above');
    application.preferredTemplatesStore.add('t', 'notes');
    await application.close();

    const file = await savedFile(fileSystem);
    expect(file.space.defaultCoverPosition).toBe('above');
    expect(file.preferredNoteTemplates).toEqual(['t']);
  });
});

describe('Space settings through the Application — independent Spaces', () => {
  it("one Space's settings never reach another, and switching back restores each", async () => {
    const one = await openSpace();
    const two = await openSpace();

    await one.application.spaceProfileStore.setDefaultCoverPosition('above');
    await one.application.spaceProfileStore.setAutoDeleteArchived(true);
    await two.application.spaceProfileStore.setDefaultCoverPosition('side');
    one.application.preferredTemplatesStore.setDefaultDailyNoteTemplate('only-in-one');
    await settle();

    expect(two.application.defaultCoverPosition).toBe('side');
    expect(two.application.autoDeleteArchived).toBe(false);
    expect(two.application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBeUndefined();

    // Switch: both are opened again from their own files.
    const backToOne = await openSpace(one.fileSystem);
    const backToTwo = await openSpace(two.fileSystem);
    expect(backToOne.application.defaultCoverPosition).toBe('above');
    expect(backToOne.application.autoDeleteArchived).toBe(true);
    expect(backToOne.application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBe('only-in-one');
    expect(backToTwo.application.defaultCoverPosition).toBe('side');
    expect(backToTwo.application.autoDeleteArchived).toBe(false);
  });
});

describe('Space settings through the Application — failed writes', () => {
  it('reports a failed write from either store, so the user can be told it was not saved', async () => {
    const { application, fileSystem } = await openSpace();
    const onError = vi.fn();
    application.subscribeSettingsWriteError(onError);
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('read-only volume'));

    await application.spaceProfileStore.setAutoDeleteArchived(true);
    application.preferredTemplatesStore.add('t', 'notes');
    await settle();
    await settle();

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('stops reporting after unsubscribing', async () => {
    const { application, fileSystem } = await openSpace();
    const onError = vi.fn();
    application.subscribeSettingsWriteError(onError)();
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('read-only volume'));

    await application.spaceProfileStore.setAutoDeleteArchived(true);

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('Space settings through the Application — saved references are validated when the Space loads', () => {
  it('a saved default note folder that no longer exists goes back to Inbox as the Space opens', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [FILE]: JSON.stringify({ space: { version: 1, id: 's', defaultNoteFolderId: 'long-gone' } }),
    });

    const { application } = await openSpace(fileSystem);
    await settle();

    expect(application.spaceProfile?.defaultNoteFolderId).toBeUndefined();
    expect(application.resolveDefaultNoteFolderId()).toBeUndefined();
    expect((await savedFile(fileSystem)).space.defaultNoteFolderId).toBeUndefined();
  });

  it('a default template that is not there is simply not applied; the saved choice is kept in case it comes back', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [FILE]: JSON.stringify({ defaultDailyNoteTemplate: 'gone' }) });

    const { application } = await openSpace(fileSystem);

    expect(application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBe('gone');
  });
});
