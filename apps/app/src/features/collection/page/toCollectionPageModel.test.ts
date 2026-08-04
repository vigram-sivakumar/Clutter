import { describe, expect, it, vi } from 'vitest';
import { toCollectionPageModel } from './toCollectionPageModel';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
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
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
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

  return { vault, query, workspace, pageOperations, effectivePageState };
}

describe('toCollectionPageModel — browse surface (Category A)', () => {
  it('uses the folder name verbatim for a subfolder entry', () => {
    const active = makeFolder({ id: 'folder-1', name: 'Root' });
    const child = makeFolder({ id: 'folder-2', name: 'Subfolder', parentId: 'folder-1' });
    const { query, effectivePageState, workspace } = setup([active, child], []);

    const model = toCollectionPageModel(active, query, effectivePageState, workspace, {
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
    const { query, effectivePageState, workspace } = setup([active], [page]);

    const model = toCollectionPageModel(active, query, effectivePageState, workspace, {
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
    const { query, effectivePageState, workspace } = setup([active], [page]);

    const model = toCollectionPageModel(active, query, effectivePageState, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', title: 'Real content here' }),
    ]);
  });
});

describe('toCollectionPageModel — sidebar/collection membership is durable-only', () => {
  it('a freshly opened draft targeting the active folder does not appear in notes before any save', async () => {
    const active = makeFolder({ id: 'folder-1' });
    const { query, pageOperations, effectivePageState, workspace } = setup([active], []);

    await pageOperations.openDraft({
      folderId: 'folder-1',
      title: 'My Draft',
    });

    const model = toCollectionPageModel(active, query, effectivePageState, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    // EffectivePageState still reconciled the draft (isDraft: true) — the
    // editor session exists — toCollectionPageModel is what now filters
    // it out of collection/notes membership until first persist.
    expect(model.notes).toEqual([]);
  });

  it('the same draft appears in notes only once it is saved (first persist)', async () => {
    const active = makeFolder({ id: 'folder-1' });
    const { query, pageOperations, effectivePageState, workspace } = setup([active], []);

    const draftId = await pageOperations.openDraft({
      folderId: 'folder-1',
      title: 'My Draft',
    });

    expect(
      toCollectionPageModel(active, query, effectivePageState, workspace, {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }).notes
    ).toEqual([]);

    await pageOperations.save(draftId, '# Hello');

    const model = toCollectionPageModel(active, query, effectivePageState, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    expect(model.notes).toEqual([
      expect.objectContaining({ id: draftId, title: 'My Draft', type: 'note' }),
    ]);
  });

  it('clicking a persisted note entry invokes onOpenNote, not onOpenDraftNote', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({ name: 'Meeting Notes' });
    const { query, effectivePageState, workspace } = setup([active], [page]);

    const onOpenNote = vi.fn();
    const onOpenDraftNote = vi.fn();
    const model = toCollectionPageModel(active, query, effectivePageState, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote,
      onOpenDraftNote,
    });

    const note = model.notes[0];

    if (!note) {
      throw new Error('expected exactly one note in the model');
    }

    note.onClick();

    expect(onOpenNote).toHaveBeenCalledWith('page-1');
    expect(onOpenDraftNote).not.toHaveBeenCalled();
  });
});
