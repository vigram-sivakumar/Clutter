import { describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { CollectionViewConfigStore } from './collection/CollectionViewConfigStore';
import { FoldStateStore } from './editor/FoldStateStore';
import { TasksViewConfigStore } from './task/TasksViewConfigStore';
import { TagExpansionStore } from './tags/TagExpansionStore';
import { WorkspaceSessionStore } from './workspace/WorkspaceSessionStore';
import { TemplateUsageStore } from './templates/TemplateUsageStore';
import { PreferredTemplatesStore } from './templates/PreferredTemplatesStore';
import { SpaceProfileStore } from './space/SpaceProfileStore';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import type { Page } from '../vault/models/Page';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import { browserCoverImageUrlResolver } from '../vault/providers/BrowserCoverImageUrlResolver';
import { flushWorkspaceStateWrites } from '../vault/initialize/workspaceStateFile';

// Same Platform boundary mock as the other Application tests.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const FILE = `${ROOT}/.clutter/workspace.json`;
const NOTE_PATH = `${ROOT}/Note.md`;

/** A Space with every setting chosen, preferred templates set, and view/layout state of every kind besides. */
const STATE = {
  space: {
    version: 1,
    id: 'space-1',
    avatar: { type: 'emoji', emoji: '🌊' },
    defaultNoteFolderId: 'folder-2',
    defaultCoverPosition: 'above',
    autoDeleteArchived: true,
    autoDeleteUnusedTags: true,
    allowMovingAssetsToFolders: true,
  },
  preferredTemplates: ['t-a'],
  preferredNoteTemplates: ['t-b'],
  defaultDailyNoteTemplate: 't-a',
  collectionViewConfig: { 'view:notes': { layout: 'card', propertyOverrides: { updated: false } } },
  tasksViewConfig: { selectedTab: 'today' },
  tagExpansion: ['work'],
};

function note(): Page {
  const page = new PageBuilder().build({
    parentId: null,
    page: {
      path: NOTE_PATH,
      directoryPath: ROOT,
      frontmatter: { id: 'note-x' },
      frontmatterAnalysis: { aliases: [] },
      content: 'A note that settings never touch',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
  return { ...page, path: NOTE_PATH, directoryPath: ROOT } as Page;
}

/** A real Application over an in-memory vault, its profile and preferred templates loaded from the Space's own file. */
async function boot() {
  const page = note();
  const fileSystem = new InMemoryVaultFileSystem({ [FILE]: JSON.stringify(STATE) });
  fileSystem.seedFile(NOTE_PATH, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  const noteBefore = await fileSystem.readFile(NOTE_PATH);

  const vault = new Vault(ROOT, [page], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const spaceProfileStore = await SpaceProfileStore.load(fileSystem, ROOT);
  const preferredTemplatesStore = await PreferredTemplatesStore.load(fileSystem, ROOT);

  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    browserCoverImageUrlResolver,
    FoldStateStore.empty(fileSystem, ROOT),
    CollectionViewConfigStore.empty(fileSystem, ROOT),
    TasksViewConfigStore.empty(fileSystem, ROOT),
    TagExpansionStore.empty(fileSystem, ROOT),
    WorkspaceSessionStore.empty(fileSystem, ROOT),
    undefined,
    TemplateUsageStore.empty(fileSystem, ROOT),
    undefined,
    undefined,
    spaceProfileStore,
    preferredTemplatesStore
  );
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  return { application, fileSystem, vault, noteBefore, spaceProfileStore, preferredTemplatesStore };
}

const persisted = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));

describe('Application.resetSpaceSettings', () => {
  it("puts every setting of the open Space back to its default, through the Application's own readers", async () => {
    const { application } = await boot();
    expect(application.defaultCoverPosition).toBe('above');
    expect(application.autoDeleteArchived).toBe(true);
    expect(application.autoDeleteUnusedTags).toBe(true);
    expect(application.allowMovingAssetsToFolders).toBe(true);

    await application.resetSpaceSettings();

    expect(application.defaultCoverPosition).toBe('side');
    expect(application.autoDeleteArchived).toBe(false);
    expect(application.autoDeleteUnusedTags).toBe(false);
    expect(application.allowMovingAssetsToFolders).toBe(false);
    expect(application.spaceProfile?.defaultNoteFolderId).toBeUndefined();
    expect(application.preferredTemplatesStore.getIds('dailyNotes')).toEqual([]);
    expect(application.preferredTemplatesStore.getIds('notes')).toEqual([]);
    expect(application.preferredTemplatesStore.getDefaultDailyNoteTemplateId()).toBeUndefined();
  });

  it("keeps the Space's identity and avatar", async () => {
    const { application } = await boot();

    await application.resetSpaceSettings();

    expect(application.spaceProfile).toEqual({ id: 'space-1', avatar: { type: 'emoji', emoji: '🌊' } });
  });

  it('persists, and touches nothing but settings: view and layout state stay in the file', async () => {
    const { application, fileSystem } = await boot();

    await application.resetSpaceSettings();
    await flushWorkspaceStateWrites();

    expect(await persisted(fileSystem)).toEqual({
      space: { version: 1, id: 'space-1', avatar: STATE.space.avatar },
      collectionViewConfig: STATE.collectionViewConfig,
      tasksViewConfig: STATE.tasksViewConfig,
      tagExpansion: STATE.tagExpansion,
    });
  });

  it("never touches the Space's content: the vault and the note's file are unchanged", async () => {
    const { application, fileSystem, vault, noteBefore } = await boot();
    const pagesBefore = vault.getPage('note-x');

    await application.resetSpaceSettings();
    await flushWorkspaceStateWrites();

    expect(vault.getPage('note-x')).toBe(pagesBefore);
    expect(await fileSystem.readFile(NOTE_PATH)).toBe(noteBefore);
  });

  it('still resets the other store when one cannot write, restores the one that failed, and says so', async () => {
    const { application, fileSystem } = await boot();
    // Make the profile's write fail and no other: it is the one write of the file that still holds the preferred
    // templates (only the other store takes those out).
    const realWrite = fileSystem.writeFile.bind(fileSystem);
    vi.spyOn(fileSystem, 'writeFile').mockImplementation(async (path, contents) => {
      if (path === FILE && contents.includes('preferredTemplates')) {
        throw new Error('disk full');
      }
      return realWrite(path, contents);
    });

    await expect(application.resetSpaceSettings()).rejects.toThrow('disk full');

    // The failed store put itself back; the other one reset.
    expect(application.defaultCoverPosition).toBe('above');
    expect(application.spaceProfile?.autoDeleteArchived).toBe(true);
    expect(application.preferredTemplatesStore.getIds('dailyNotes')).toEqual([]);
  });
});
