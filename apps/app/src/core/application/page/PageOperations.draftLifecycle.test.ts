import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { EffectivePageState } from './EffectivePageState';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultQuery } from '../../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Folder } from '../../vault/models/Folder';
import { NavigationRouter } from '../navigation/NavigationRouter';
import { createNoteFromTemplate } from '@features/notes/helpers/createNoteFromTemplate';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function setup(folders: Folder[] = []) {
  const vault = new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => pageOperations.flushActivePage(),
    documentRegistry,
    saveCoordinator,
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );
  const effectivePageState = new EffectivePageState(
    vault,
    query,
    pageOperations,
    workspace
  );

  const navigation = new NavigationRouter(folderOperations, pageOperations, vault, workspace);

  return {
    navigation,
    folderOperations,
    fileSystem,
    vault,
    query,
    workspace,
    documentRegistry,
    pageOperations,
    effectivePageState,
    // Sessions with no Vault page are, by definition, the unsaved draft(s)
    // — the single-draft invariant says this is never above 1.
    draftCount: () =>
      documentRegistry.getAll().filter((session) => !vault.getPage(session.id)).length,
  };
}


describe('draft lifecycle: an empty draft is discarded when the user navigates away', () => {
  const projects = makeFolder('projects', `${ROOT}/Projects`, null);

  async function withNote() {
    const ctx = setup([projects]);
    const noteId = await ctx.pageOperations.create({ folderId: null, title: 'A', body: 'a body', activate: false });
    await ctx.pageOperations.open(noteId);
    return { ...ctx, noteId };
  }

  // Markdown files on disk (root + Projects): a discarded draft must never have written one.
  const pageCount = async (ctx: { fileSystem: InMemoryVaultFileSystem }) => {
    let count = 0;
    for (const dir of [ROOT, `${ROOT}/Projects`]) {
      if (await ctx.fileSystem.exists(dir)) {
        count += (await ctx.fileSystem.readDirectory(dir)).filter((entry) => entry.name.endsWith('.md')).length;
      }
    }
    return count;
  };

  const leaves: Array<[string, (ctx: Awaited<ReturnType<typeof withNote>>) => Promise<void> | void]> = [
    ['selecting another note', (c) => c.pageOperations.open(c.noteId)],
    ['opening a collection (folder)', (c) => c.folderOperations.open(projects.id)],
    ['a sidebar section: Favorites', (c) => c.navigation.openFavorites()],
    ['a sidebar section: Tasks', (c) => c.navigation.openAllTasks()],
    ['a sidebar section: Workspace', (c) => c.navigation.openWorkspace()],
    ['a tag collection', (c) => c.navigation.openTag('work')],
  ];

  it.each(leaves)('navigating away via %s discards the empty draft', async (_name, leave) => {
    const ctx = await withNote();
    const pagesBefore = await pageCount(ctx);
    const draftId = await ctx.pageOperations.openDraft({ folderId: projects.id });

    expect(ctx.pageOperations.getDraft(draftId)).toBeDefined();
    await leave(ctx);

    await vi.waitFor(() => expect(ctx.pageOperations.getDraft(draftId)).toBeUndefined());
    expect(ctx.workspace.openPages).not.toContain(draftId);
    expect(ctx.documentRegistry.get(draftId)).toBeUndefined();
    expect(ctx.vault.getPage(draftId)).toBeUndefined();
    expect(await pageCount(ctx)).toBe(pagesBefore);
    await expect(ctx.pageOperations.open(draftId)).rejects.toThrow(/not found/i);
  });

  it('returning (Back) does not restore the discarded draft, and the next note is a fresh draft', async () => {
    const ctx = await withNote();
    const first = await ctx.pageOperations.openDraft({ folderId: projects.id, title: 'stale title', tags: ['stale'] });
    ctx.navigation.openFavorites();
    await vi.waitFor(() => expect(ctx.pageOperations.getDraft(first)).toBeUndefined());

    ctx.navigation.back();
    await vi.waitFor(() => expect(ctx.workspace.activePageId).toBe(ctx.noteId));
    expect(ctx.workspace.openPages).not.toContain(first);

    const second = await ctx.pageOperations.openDraft({ folderId: null });
    expect(second).not.toBe(first);
    expect(ctx.pageOperations.getDraft(second)).toEqual({ folderId: null, type: 'note', title: undefined, tags: undefined });
    expect(ctx.documentRegistry.get(second)!.currentRevision.markdown).toBe('');
  });

  it('a draft with body content is not silently discarded, even when left through a path that never flushes', async () => {
    const ctx = await withNote();
    const draftId = await ctx.pageOperations.openDraft({ folderId: projects.id });
    ctx.pageOperations.commitEdit(draftId, 'real work');

    ctx.navigation.openFavorites();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ctx.documentRegistry.get(draftId)?.currentRevision.markdown).toBe('real work');
    expect(ctx.pageOperations.getDraft(draftId) !== undefined || ctx.vault.getPage(draftId) !== undefined).toBe(true);
  });

  it('a committed title promotes the draft; leaving keeps it as a real page', async () => {
    const ctx = await withNote();
    const draftId = await ctx.pageOperations.openDraft({ folderId: projects.id });
    await ctx.pageOperations.updateDraftTitle(draftId, 'Named');

    ctx.navigation.openFavorites();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ctx.vault.getPage(draftId)?.name).toBe('Named');
    expect(ctx.pageOperations.getDraft(draftId)).toBeUndefined();
  });

  it('committed metadata promotes the draft; leaving keeps it as a real page', async () => {
    const ctx = await withNote();
    const draftId = await ctx.pageOperations.openDraft({ folderId: projects.id });
    await ctx.pageOperations.updateMetadata(draftId, { description: 'kept' });

    ctx.navigation.openFavorites();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ctx.vault.getPage(draftId)?.metadata.description).toBe('kept');
  });

  it('applied template content survives navigation', async () => {
    const ctx = await withNote();
    await createNoteFromTemplate(ctx.pageOperations, projects.id, '# From template\n\nbody');
    const draftId = ctx.workspace.activePageId!;

    ctx.navigation.openFavorites();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ctx.documentRegistry.get(draftId)?.currentRevision.markdown).toContain('From template');
    expect(ctx.pageOperations.getDraft(draftId) !== undefined || ctx.vault.getPage(draftId) !== undefined).toBe(true);
  });

  it('discarding a draft leaves an existing note, its session and its unsaved edits untouched', async () => {
    const ctx = await withNote();
    ctx.pageOperations.commitEdit(ctx.noteId, 'edited, not yet saved');
    const sessionBefore = ctx.documentRegistry.get(ctx.noteId);
    const draftId = await ctx.pageOperations.openDraft({ folderId: projects.id });

    await ctx.pageOperations.open(ctx.noteId);
    await vi.waitFor(() => expect(ctx.pageOperations.getDraft(draftId)).toBeUndefined());

    expect(ctx.documentRegistry.get(ctx.noteId)).toBe(sessionBefore);
    expect(ctx.documentRegistry.get(ctx.noteId)!.currentRevision.markdown).toBe('edited, not yet saved');
    expect(ctx.workspace.activePageId).toBe(ctx.noteId);
    expect(ctx.vault.getPage(ctx.noteId)).toBeDefined();
  });

  it('rapid navigation never persists or restores a discarded draft, and late callbacks cannot resurrect it', async () => {
    const ctx = await withNote();
    const pagesBefore = await pageCount(ctx);
    const ids: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      ids.push(await ctx.pageOperations.openDraft({ folderId: projects.id }));
      ctx.navigation.openFavorites();
      ctx.navigation.openWorkspace();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const id of new Set(ids)) {
      // What a late editor/timer callback would do for the discarded id.
      await ctx.pageOperations.requestSave(id);
      await ctx.pageOperations.save(id, '').catch(() => undefined);
      await ctx.pageOperations.updateDraftTitle(id, 'ghost').catch(() => undefined);
      await ctx.pageOperations.updateMetadata(id, { description: 'ghost' }).catch(() => undefined);
      expect(ctx.pageOperations.getDraft(id)).toBeUndefined();
      expect(ctx.vault.getPage(id)).toBeUndefined();
    }
    expect(await pageCount(ctx)).toBe(pagesBefore);
    expect(ctx.draftCount()).toBe(0);
  });
});

describe('a new note declares no properties and no cover until they are explicitly added', () => {
  const folder = makeFolder('empty', `${ROOT}/Empty`, null);
  const frontmatter = async (ctx: ReturnType<typeof setup>, id: string) =>
    ctx.fileSystem.readFile(ctx.vault.getPage(id)!.path);

  it.each([
    ['its body', (c: ReturnType<typeof setup>, id: string) => c.pageOperations.save(id, 'hello')],
    ['a committed title', (c: ReturnType<typeof setup>, id: string) => c.pageOperations.updateDraftTitle(id, 'Titled')],
    ['committed metadata', (c: ReturnType<typeof setup>, id: string) => c.pageOperations.updateMetadata(id, { description: 'd' })],
  ])('promoting the draft through %s writes neither created nor modified, and no cover', async (_name, promote) => {
    const ctx = setup([folder]);
    const id = await ctx.pageOperations.openDraft({ folderId: folder.id });

    await promote(ctx, id);

    const content = await frontmatter(ctx, id);
    expect(content).not.toMatch(/^created:/m);
    expect(content).not.toMatch(/^modified:/m);
    expect(content).not.toMatch(/^cover/m);
    const metadata = ctx.vault.getPage(id)!.metadata;
    expect(metadata.cover).toBeNull();
    expect(metadata.frontmatterEntryOrder).not.toContain('created');
    expect(metadata.frontmatterEntryOrder).not.toContain('modified');
  });

  it('Created and Last edited stay independent: adding one on a draft writes only that key, adding the other later is its own change', async () => {
    const ctx = setup([folder]);
    const id = await ctx.pageOperations.openDraft({ folderId: folder.id });

    await ctx.pageOperations.addSystemProperty(id, 'created');
    let content = await frontmatter(ctx, id);
    expect(content).toMatch(/^created: true$/m);
    expect(content).not.toMatch(/^modified:/m);

    await ctx.pageOperations.addSystemProperty(id, 'modified');
    content = await frontmatter(ctx, id);
    expect(content).toMatch(/^created: true$/m);
    expect(content).toMatch(/^modified: true$/m);

    await ctx.pageOperations.removeSystemProperty(id, 'created');
    content = await frontmatter(ctx, id);
    expect(content).not.toMatch(/^created:/m);
    expect(content).toMatch(/^modified: true$/m);
  });
});
