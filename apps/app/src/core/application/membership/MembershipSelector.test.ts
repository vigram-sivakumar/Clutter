import { describe, expect, it } from 'vitest';
import { MembershipSelector } from './MembershipSelector';
import { EffectivePageState } from '../page/EffectivePageState';
import { PageOperations } from '../page/PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePathResolver } from '../page/PagePathResolver';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { Vault } from '../../vault/models/Vault';
import { VaultQuery } from '../../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';

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
    path: `${ROOT}/Root`,
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
    () => {}
  );
}

function setup(folders: Folder[] = [], pages: Page[] = []) {
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
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);

  return { vault, query, workspace, pageOperations, effectivePageState, membershipSelector };
}

describe('MembershipSelector.getWorkspaceFolders (ADR-023)', () => {
  it('excludes every reserved folder, migrated from the retired VaultQuery.getVisibleRootFolders coverage', () => {
    const folders = [
      makeFolder({ id: 'folder-z', name: 'Zebra', path: `${ROOT}/Zebra` }),
      makeFolder({ id: 'folder-a', name: 'Apple', path: `${ROOT}/Apple` }),
      makeFolder({ id: 'folder-archive', name: 'Archive', path: `${ROOT}/Archive` }),
    ];
    const { membershipSelector } = setup(folders);

    expect(membershipSelector.getWorkspaceFolders().map((f) => f.name)).toEqual([
      'Apple',
      'Zebra',
    ]);
  });

  it('excludes a nested folder that merely shares a reserved name (isReservedFolder is path/parentId-aware, not name-only)', () => {
    const parent = makeFolder({ id: 'parent', name: 'Projects', path: `${ROOT}/Projects` });
    const nestedNamedArchive = makeFolder({
      id: 'nested-archive',
      name: 'Archive',
      path: `${ROOT}/Projects/Archive`,
      parentId: 'parent',
    });
    const { membershipSelector } = setup([parent, nestedNamedArchive]);

    // Only true top-level folders are eligible for Workspace membership at
    // all — this asserts the nested one isn't excluded as "reserved" by a
    // weaker, name-only check the way VaultQuery.getVisibleRootFolders()
    // (the implementation this replaced) never actually risked, but which
    // isWorkspaceFolder's own isSystemFolder delegation must still get
    // right for any future root-scoped consumer.
    expect(membershipSelector.isWorkspaceFolder(nestedNamedArchive)).toBe(false);
    expect(membershipSelector.getWorkspaceFolders().map((f) => f.id)).toEqual(['parent']);
  });
});

describe('MembershipSelector.isSystemFolder', () => {
  it('delegates to Vault.isReservedFolder rather than re-deriving reserved-ness', () => {
    const reserved = makeFolder({ id: 'archive', name: 'Archive', path: `${ROOT}/Archive` });
    const ordinary = makeFolder({ id: 'projects', name: 'Projects', path: `${ROOT}/Projects` });
    const { membershipSelector } = setup([reserved, ordinary]);

    expect(membershipSelector.isSystemFolder(reserved)).toBe(true);
    expect(membershipSelector.isSystemFolder(ordinary)).toBe(false);
  });
});

describe('MembershipSelector Notes/Daily Notes classification (ADR-023 §4)', () => {
  it('isNotesPage/isDailyNotePage are identity-driven (page.type), independent of folderId', () => {
    const { membershipSelector, effectivePageState } = setup(
      [],
      [
        makePage({ id: 'note-1', type: 'note', parentId: null }),
        makePage({ id: 'daily-1', type: 'daily-note', name: '2026-08-05', parentId: null }),
      ]
    );

    const note = effectivePageState.getPage('note-1')!;
    const dailyNote = effectivePageState.getPage('daily-1')!;

    expect(membershipSelector.isNotesPage(note)).toBe(true);
    expect(membershipSelector.isDailyNotePage(note)).toBe(false);
    expect(membershipSelector.isNotesPage(dailyNote)).toBe(false);
    expect(membershipSelector.isDailyNotePage(dailyNote)).toBe(true);
  });

  it('getNotesChildPages/getDailyNoteChildPages split a shared folderId by type, both with folderId: null', () => {
    const { membershipSelector } = setup(
      [],
      [
        makePage({ id: 'note-1', type: 'note', parentId: null }),
        makePage({ id: 'daily-1', type: 'daily-note', name: '2026-08-05', parentId: null }),
      ]
    );

    expect(membershipSelector.getNotesChildPages(null).map((p) => p.id)).toEqual(['note-1']);
    expect(membershipSelector.getDailyNoteChildPages(null).map((p) => p.id)).toEqual(['daily-1']);
  });
});

describe('MembershipSelector.isArchivedPage', () => {
  it('delegates to the same metadata.status predicate VaultQuery.getArchivedPages uses', () => {
    const archived = makePage({ id: 'archived-1', metadata: { ...defaultPageMetadata, status: 'archived' } });
    const active = makePage({ id: 'active-1' });
    const { membershipSelector } = setup([], [archived, active]);

    expect(membershipSelector.isArchivedPage(archived)).toBe(true);
    expect(membershipSelector.isArchivedPage(active)).toBe(false);
  });
});
