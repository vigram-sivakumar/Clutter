import { describe, expect, it } from 'vitest';
import { getFavoriteItems } from './getFavoriteItems';
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
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
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
  defaultTemplateId: null,
  icon: null,
  favorite: true,
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

const defaultPageMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  description: null,
  favorite: true,
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
    name: 'Projects',
    path: '/vault/Projects',
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
    path: '/vault/Untitled.md',
    parentId: null,
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
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
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
    new DailyNoteService(),
    () => {}
  );
  const effectivePageState = new EffectivePageState(
    vault,
    query,
    pageOperations,
    workspace
  );

  return { vault, query, workspace, pageOperations, effectivePageState };
}

describe('getFavoriteItems — membership durable-only, label via EffectivePageState', () => {
  it('uses the folder name verbatim — folders never go through the display-label fallback chain', () => {
    const folder = makeFolder({ name: 'Projects' });
    const { query, effectivePageState } = setup([folder], []);

    const items = getFavoriteItems(query, effectivePageState);

    expect(items).toEqual([
      {
        id: 'folder-1',
        title: 'Projects',
        name: 'Projects',
        titleStyle: 'default',
        type: 'folder',
        emoji: null,
        status: 'active',
      },
    ]);
  });

  it('uses the real filename for a deliberately-named favorited page', () => {
    const page = makePage({ name: 'Meeting Notes' });
    const { query, effectivePageState } = setup([], [page]);

    const items = getFavoriteItems(query, effectivePageState);

    expect(items).toEqual([
      {
        id: 'page-1',
        title: 'Meeting Notes',
        name: 'Meeting Notes',
        titleStyle: 'default',
        type: 'note',
        emoji: null,
      },
    ]);
  });

  it('does not show a raw auto-generated name for a favorited-but-unnamed page — body content is never used as a Note title', () => {
    const page = makePage({
      name: 'Untitled 2',
      source: { markdown: 'Real content here' },
    });
    const { query, effectivePageState } = setup([], [page]);

    const items = getFavoriteItems(query, effectivePageState);

    expect(items).toEqual([
      {
        id: 'page-1',
        title: 'New Note',
        name: expect.any(String),
        titleStyle: 'placeholder',
        type: 'note',
        emoji: null,
      },
    ]);
  });

  it('marks the item as a placeholder when the label falls all the way through to it', () => {
    const page = makePage({ name: 'Untitled', source: { markdown: '' } });
    const { query, effectivePageState } = setup([], [page]);

    const items = getFavoriteItems(query, effectivePageState);

    expect(items).toEqual([
      {
        id: 'page-1',
        title: 'New Note',
        name: expect.any(String),
        titleStyle: 'placeholder',
        type: 'note',
        emoji: null,
      },
    ]);
  });

  it('a live, uncommitted-to-disk body edit on an open favorited page does not change its title — Notes never derive a title from body content', async () => {
    const page = makePage({ name: 'Untitled', source: { markdown: '' } });
    const { query, pageOperations, effectivePageState } = setup([], [page]);

    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Live, unsaved content');

    const items = getFavoriteItems(query, effectivePageState);

    expect(items).toEqual([
      {
        id: 'page-1',
        title: 'New Note',
        name: expect.any(String),
        titleStyle: 'placeholder',
        type: 'note',
        emoji: null,
      },
    ]);
  });

  it('flags a favorited note that lives in Templates (the page knows it is a Template)', () => {
    const templates = makeFolder({ id: 'templates', name: 'Templates', path: `${ROOT}/Templates` });
    const inTemplates = makePage({
      id: 'page-in-templates',
      path: `${ROOT}/Templates/T.md`,
      parentId: 'templates',
      metadata: { ...defaultPageMetadata, favorite: true },
    });
    const elsewhere = makePage({
      id: 'page-elsewhere',
      path: `${ROOT}/Other.md`,
      parentId: null,
      metadata: { ...defaultPageMetadata, favorite: true },
    });
    const { query, effectivePageState } = setup([templates], [inTemplates, elsewhere]);

    const items = getFavoriteItems(query, effectivePageState);

    expect(items.find((item) => item.id === 'page-in-templates')?.isTemplate).toBe(true);
    expect(items.find((item) => item.id === 'page-elsewhere')?.isTemplate).toBeUndefined();
  });

  it('carries the resource\'s own name (what an inline rename edits) apart from its display title', () => {
    const page = makePage({ name: 'Untitled 2', source: { markdown: 'Real content here' } });
    const { query, effectivePageState } = setup([], [page]);

    const [item] = getFavoriteItems(query, effectivePageState);

    expect(item?.name).toBe('Untitled 2');
    expect(item?.title).toBe('New Note');
  });

  it('flags a favorited folder inside Assets with its Move hierarchy, and no other folder (Templates are flat)', () => {
    const inAssets = makeFolder({
      id: 'f-a',
      name: 'Images',
      path: `${ROOT}/Assets/Images`,
      metadata: { ...defaultFolderMetadata, favorite: true },
    });
    const ordinary = makeFolder({
      id: 'f-o',
      name: 'Projects',
      path: `${ROOT}/Projects`,
      metadata: { ...defaultFolderMetadata, favorite: true },
    });
    const { query, effectivePageState } = setup([inAssets, ordinary], []);

    const items = getFavoriteItems(query, effectivePageState, (folderId) =>
      folderId === 'f-a' ? 'assets' : 'workspace'
    );

    expect(items.find((item) => item.id === 'f-a')?.moveZone).toBe('assets');
    expect(items.find((item) => item.id === 'f-o')?.moveZone).toBeUndefined();
  });
});

describe('getFavoriteItems — a favorite that is archived keeps its flag but is not listed', () => {
  const archivedFolder = makeFolder({
    id: 'folder-archived',
    name: 'Old',
    path: '/vault/Archive/Old',
    metadata: { ...defaultFolderMetadata, status: 'archived' },
  });

  it('a favorite note or folder archived itself is not listed, and still has favorite: true', () => {
    const note = makePage({ id: 'p', path: '/vault/Archive/p.md', metadata: { ...defaultPageMetadata, status: 'archived' } });
    const { query, effectivePageState } = setup([archivedFolder], [note]);

    expect(getFavoriteItems(query, effectivePageState)).toEqual([]);
    expect(note.metadata.favorite).toBe(true);
    expect(archivedFolder.metadata.favorite).toBe(true);
  });

  it('a favorite inside an archived folder (own status active) is not listed, and keeps its flag for restore', () => {
    const inside = makePage({ id: 'p', path: '/vault/Archive/Old/n.md', parentId: 'folder-archived' });
    const { query, effectivePageState } = setup([archivedFolder], [inside]);

    expect(getFavoriteItems(query, effectivePageState)).toEqual([]);
    expect(inside.metadata.favorite).toBe(true);
  });
});
