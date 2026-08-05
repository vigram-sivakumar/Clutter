import { describe, expect, it, vi } from 'vitest';
import { toCollectionPageModel } from './toCollectionPageModel';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/application/folder/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const defaultPageMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  description: null,
  favorite: false,
  status: 'active',
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

const defaultAnalysis: Page['analysis'] = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Root',
    path: ROOT,
    parentId: null,
    metadata: defaultFolderMetadata,
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    type: 'note',
    name: 'Untitled',
    path: `${ROOT}/Untitled.md`,
    parentId: 'folder-1',
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

function makeFolderOperations(
  vault: Vault,
  workspace: Workspace,
  coordinator: PagePersistenceCoordinator
): FolderOperations {
  return new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {}
  );
}

function setup(folders: Folder[], pages: Page[]) {
  // Mirrors VaultBuilder: tags are derived from pages, not hand-supplied,
  // so a fixture page with #tag occurrences in its analysis is reflected
  // in vault.tags()/getTagByName() exactly like a real scan would.
  const tags = new TagBuilder().build(pages);
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    tags,
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const query = new VaultQuery(vault);
  const workspace = new Workspace();
  const fileSystem = new InMemoryVaultFileSystem();
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
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    makeFolderOperations(vault, workspace, coordinator),
    new DailyNoteService()
  );
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);

  return { vault, query, workspace, pageOperations, effectivePageState, membershipSelector };
}

describe('toCollectionPageModel — browse surface (Category A)', () => {
  it('uses the folder name verbatim for a subfolder entry', () => {
    const active = makeFolder({ id: 'folder-1', name: 'Root' });
    const child = makeFolder({ id: 'folder-2', name: 'Subfolder', parentId: 'folder-1' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([active, child], []);

    const model = toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.folders).toEqual([
      expect.objectContaining({ id: 'folder-2', title: 'Subfolder' }),
    ]);
  });

  it('uses the real filename for a deliberately-named note', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({ name: 'Meeting Notes' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([active], [page]);

    const model = toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', title: 'Meeting Notes' }),
    ]);
  });

  it('does not show the raw auto-generated filename for an unnamed note', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({
      name: 'Untitled 2',
      source: { markdown: 'Real content here' },
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([active], [page]);

    const model = toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', title: 'Real content here' }),
    ]);
  });
});

describe('toCollectionPageModel — draft-only pages appear immediately (ARCHITECTURE_RULES.md rule 13)', () => {
  it('a freshly opened draft targeting the active folder appears in notes before any save', async () => {
    const active = makeFolder({ id: 'folder-1' });
    const { vault, query, pageOperations, effectivePageState, membershipSelector, workspace } = setup([active], []);

    const draftId = await pageOperations.openDraft({
      folderId: 'folder-1',
      title: 'My Draft',
    });

    const model = toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: draftId, title: 'My Draft', type: 'note' }),
    ]);
  });

  it('clicking a draft entry invokes onOpenDraftNote, not onOpenNote', async () => {
    const active = makeFolder({ id: 'folder-1' });
    const { vault, query, pageOperations, effectivePageState, membershipSelector, workspace } = setup([active], []);

    await pageOperations.openDraft({ folderId: 'folder-1', title: 'My Draft' });

    const onOpenNote = vi.fn();
    const onOpenDraftNote = vi.fn();
    const model = toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote,
      onOpenDraftNote,
    });

    const note = model.notes[0];

    if (!note) {
      throw new Error('expected exactly one note in the model');
    }

    note.onClick();

    expect(onOpenDraftNote).toHaveBeenCalledWith(note.id);
    expect(onOpenNote).not.toHaveBeenCalled();
  });
});

describe('toCollectionPageModel — a reserved folder viewed directly uses its canonical system-location label', () => {
  it("shows the canonical 'Archive' label, not the raw folder name, when Archive is the active folder", () => {
    const archive = makeFolder({
      id: 'archive-folder',
      name: 'Archive',
      path: `${ROOT}/Archive`,
      parentId: null,
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([archive], []);

    const model = toCollectionPageModel(archive, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.title).toBe(getSystemLocationPresentation('archive').label);
  });

  it('leaves an ordinary folder\'s title as its raw name, unaffected', () => {
    const active = makeFolder({ id: 'folder-1', name: 'Projects' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([active], []);

    const model = toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.title).toBe('Projects');
  });
});

describe('toCollectionPageModel — filtered views (ADR-022), reusing the same membership the sidebar uses', () => {
  it("'workspace' shows exactly the root folders and root notes, titled from systemPresentation", () => {
    const root = makeFolder({ id: 'folder-1', name: 'Root', parentId: null });
    const nested = makeFolder({ id: 'folder-2', name: 'Nested', parentId: 'folder-1' });
    const rootPage = makePage({ id: 'page-1', name: 'Root Note', parentId: null });
    const nestedPage = makePage({ id: 'page-2', name: 'Nested Note', parentId: 'folder-1' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup(
      [root, nested],
      [rootPage, nestedPage]
    );

    const model = toCollectionPageModel(
      { view: { kind: 'workspace' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe(getSystemLocationPresentation('workspace').label);
    expect(model.folders).toEqual([expect.objectContaining({ id: 'folder-1' })]);
    expect(model.notes).toEqual([expect.objectContaining({ id: 'page-1' })]);
  });

  it("'workspace' excludes a root-level Daily Note draft (ADR-023, Phase 6 parity fix) — the Workspace page must match FolderTree's root exactly", async () => {
    const { vault, query, effectivePageState, membershipSelector, workspace, pageOperations } =
      setup([], []);

    // Mirrors a fresh-vault boot: no Daily Notes month folder exists yet,
    // so the draft's folderId is null — previously indistinguishable, in
    // this collection page, from a root-level Note.
    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    const model = toCollectionPageModel(
      { view: { kind: 'workspace' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.notes).toEqual([]);
  });

  it("'favorites' shows exactly the favorited folders and pages, regardless of where they live in the tree", () => {
    const favoritedFolder = makeFolder({
      id: 'folder-1',
      name: 'Favorited',
      parentId: null,
      metadata: { ...defaultFolderMetadata, favorite: true },
    });
    const plainFolder = makeFolder({
      id: 'folder-2',
      name: 'Plain',
      parentId: null,
    });
    const favoritedPage = makePage({
      id: 'page-1',
      name: 'Favorited Note',
      parentId: 'folder-2',
      metadata: { ...defaultPageMetadata, favorite: true },
    });
    const plainPage = makePage({ id: 'page-2', name: 'Plain Note', parentId: 'folder-2' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup(
      [favoritedFolder, plainFolder],
      [favoritedPage, plainPage]
    );

    const model = toCollectionPageModel(
      { view: { kind: 'favorites' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe(getSystemLocationPresentation('favorites').label);
    expect(model.folders).toEqual([expect.objectContaining({ id: 'folder-1' })]);
    expect(model.notes).toEqual([expect.objectContaining({ id: 'page-1' })]);
  });

  it("clicking a 'workspace' folder entry invokes onOpenFolder, same as an ordinary folder view", () => {
    const root = makeFolder({ id: 'folder-1', name: 'Root', parentId: null });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([root], []);
    const onOpenFolder = vi.fn();

    const model = toCollectionPageModel(
      { view: { kind: 'workspace' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder, onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    model.folders[0]?.onClick();

    expect(onOpenFolder).toHaveBeenCalledWith('folder-1');
  });
});

describe("toCollectionPageModel — a 'tag' filtered view, reusing toFilteredCollectionPageModel rather than a parallel mapper", () => {
  it('shows exactly the pages referencing the tag, with no folders — title/icon come from the Tag entity, not the folder/note lookup', () => {
    const tagged = makePage({
      id: 'page-1',
      name: 'Tagged',
      parentId: null,
      analysis: { ...defaultAnalysis, tags: [{ name: 'Project', sourcePageId: 'page-1' }] },
    });
    const untagged = makePage({ id: 'page-2', name: 'Untagged', parentId: null });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([], [tagged, untagged]);

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'Project' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe('Project');
    expect(model.folders).toEqual([]);
    expect(model.notes).toEqual([expect.objectContaining({ id: 'page-1' })]);
  });

  it('falls back to the raw tag name as title when the tag has no matching Tag entity (e.g. it was just removed from Markdown)', () => {
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([], []);

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'ghost' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe('ghost');
    expect(model.notes).toEqual([]);
  });

  it('clicking a note entry invokes onOpenNote, same as any other collection view', () => {
    const tagged = makePage({
      id: 'page-1',
      name: 'Tagged',
      parentId: null,
      analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'page-1' }] },
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([], [tagged]);
    const onOpenNote = vi.fn();

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'project' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote, onOpenDraftNote: vi.fn() }
    );

    model.notes[0]?.onClick();

    expect(onOpenNote).toHaveBeenCalledWith('page-1');
  });
});
