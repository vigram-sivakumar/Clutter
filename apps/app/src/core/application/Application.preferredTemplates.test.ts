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
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import type { Folder } from '../vault/models/Folder';
import type { Page } from '../vault/models/Page';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import { browserCoverImageUrlResolver } from '../vault/providers/BrowserCoverImageUrlResolver';

// Same Platform boundary mock as the other Application tests.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const folderMetadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const folder = (
  id: string,
  name: string,
  parentId: string | null = null
): Folder => ({
  id,
  name,
  path: `${ROOT}/${name}`,
  parentId,
  metadata: folderMetadata,
});

function templatePage(
  id: string,
  name: string,
  parentId: string | null,
  directory: string
): Page {
  return new PageBuilder().build({
    parentId,
    page: {
      path: `${ROOT}/${directory}/${name}.md`,
      directoryPath: `${ROOT}/${directory}`,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `${name} body`,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

/** A real Application over an in-memory vault: three templates in Templates, one ordinary note, an Archive. */
async function boot(preferred: string[]) {
  const templatesFolder = folder('folder-templates', 'Templates');
  const pages = [
    templatePage('t-a', 'Alpha', templatesFolder.id, 'Templates'),
    templatePage('t-b', 'Beta', templatesFolder.id, 'Templates'),
    templatePage('t-c', 'Gamma', templatesFolder.id, 'Templates'),
    templatePage('note-x', 'Note', null, '.'),
  ].map((page) =>
    page.id === 'note-x'
      ? { ...page, path: `${ROOT}/Note.md`, directoryPath: ROOT }
      : page
  ) as Page[];

  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const page of pages) {
    fileSystem.seedFile(
      page.path,
      serializer.serializeDocument(page, page.source.markdown)
    );
  }

  const vault = new Vault(
    ROOT,
    pages,
    [folder('folder-archive', 'Archive'), templatesFolder],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  // The folders exist on disk too, so archiving/deleting one can move/remove its directory.
  await fileSystem.createDirectory(`${ROOT}/Archive`);
  await fileSystem.createDirectory(`${ROOT}/Templates`);
  const store = PreferredTemplatesStore.empty(fileSystem, ROOT);
  preferred.forEach((id) => store.add(id));
  // Let the store's own fire-and-forget writes from the setup land before a test starts watching writes.
  await new Promise((resolve) => setTimeout(resolve, 0));

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
    undefined,
    store
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );

  return { application, store, fileSystem, vault };
}

describe('preferred templates through the real delete flow', () => {
  it('archiving and restoring a preferred template keeps its preference, in the original order', async () => {
    const { application, store } = await boot(['t-a', 't-b', 't-c']);

    await application.pageOperations.archive('t-b');
    expect(store.getIds()).toEqual(['t-a', 't-b', 't-c']);

    await application.pageOperations.restore('t-b');
    expect(store.getIds()).toEqual(['t-a', 't-b', 't-c']);
  });

  it('permanently deleting a preferred template removes only its id, keeping the others in order', async () => {
    const { application, store, vault } = await boot(['t-a', 't-b', 't-c']);

    await application.pageOperations.archive('t-b');
    await application.pageOperations.delete('t-b');

    expect(vault.getPage('t-b')).toBeUndefined();
    expect(store.getIds()).toEqual(['t-a', 't-c']);
  });

  it('archiving a default daily note template keeps the choice; permanently deleting it clears the choice', async () => {
    const { application, store, fileSystem } = await boot(['t-a']);
    store.setDefaultDailyNoteTemplate('t-b');

    await application.pageOperations.archive('t-b');
    expect(store.getDefaultDailyNoteTemplateId()).toBe('t-b');
    await application.pageOperations.restore('t-b');
    expect(store.getDefaultDailyNoteTemplateId()).toBe('t-b');

    await application.pageOperations.archive('t-b');
    await application.pageOperations.delete('t-b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getDefaultDailyNoteTemplateId()).toBeUndefined();
    expect(store.getIds()).toEqual(['t-a']);
    expect((await PreferredTemplatesStore.load(fileSystem, ROOT)).getDefaultDailyNoteTemplateId()).toBeUndefined();
  });

  it('keeps the removal after a restart', async () => {
    const { application, store, fileSystem } = await boot(['t-a', 't-b']);

    await application.pageOperations.archive('t-a');
    await application.pageOperations.delete('t-a');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getIds()).toEqual(['t-b']);
    expect(
      (await PreferredTemplatesStore.load(fileSystem, ROOT)).getIds()
    ).toEqual(['t-b']);
  });

  it('deleting a template that is not preferred leaves the list, and its file, alone', async () => {
    const { application, store, fileSystem } = await boot(['t-a', 't-c']);
    const listener = vi.fn();
    store.subscribe(listener);
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    await application.pageOperations.archive('t-b');
    await application.pageOperations.delete('t-b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getIds()).toEqual(['t-a', 't-c']);
    expect(listener).not.toHaveBeenCalled();
    expect(
      writeFile.mock.calls.filter(([path]) =>
        String(path).endsWith('workspace.json')
      )
    ).toHaveLength(0);
  });

  it('deleting an ordinary note that is not a template changes nothing', async () => {
    const { application, store } = await boot(['t-a']);

    await application.pageOperations.archive('note-x');
    await application.pageOperations.delete('note-x');

    expect(store.getIds()).toEqual(['t-a']);
  });

  it('a delete that is refused (the page is not archived) keeps the preference', async () => {
    const { application, store, vault } = await boot(['t-a']);

    await expect(application.pageOperations.delete('t-a')).rejects.toThrow(
      /not archived/
    );

    expect(vault.getPage('t-a')).toBeDefined();
    expect(store.getIds()).toEqual(['t-a']);
  });

  it('permanently deleting a folder removes the preferences of the templates inside it, and only those', async () => {
    const { application, store } = await boot([
      'keep-before',
      't-a',
      't-b',
      'keep-after',
      't-c',
    ]);

    await application.folderOperations.archive('folder-templates');
    // The templates are still archived, not deleted: their preferences stay.
    expect(store.getIds()).toEqual([
      'keep-before',
      't-a',
      't-b',
      'keep-after',
      't-c',
    ]);

    await application.folderOperations.delete('folder-templates');
    expect(store.getIds()).toEqual(['keep-before', 'keep-after']);
  });
});
