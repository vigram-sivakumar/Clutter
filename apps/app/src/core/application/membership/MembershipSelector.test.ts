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
import type { VaultResource } from '../../vault/models/VaultResource';

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
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );
}

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'Cover.png',
    path: `${ROOT}/Cover.png`,
    parentId: null,
    ...overrides,
  };
}

function setup(
  folders: Folder[] = [],
  pages: Page[] = [],
  resources: VaultResource[] = []
) {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
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
  const membershipSelector = new MembershipSelector(
    vault,
    query,
    effectivePageState
  );

  return {
    vault,
    query,
    workspace,
    pageOperations,
    effectivePageState,
    membershipSelector,
  };
}

describe('MembershipSelector.getWorkspaceFolders (ADR-023)', () => {
  it('excludes every reserved folder, migrated from the retired VaultQuery.getVisibleRootFolders coverage', () => {
    const folders = [
      makeFolder({ id: 'folder-z', name: 'Zebra', path: `${ROOT}/Zebra` }),
      makeFolder({ id: 'folder-a', name: 'Apple', path: `${ROOT}/Apple` }),
      makeFolder({
        id: 'folder-archive',
        name: 'Archive',
        path: `${ROOT}/Archive`,
      }),
    ];
    const { membershipSelector } = setup(folders);

    expect(membershipSelector.getWorkspaceFolders().map((f) => f.name)).toEqual(
      ['Apple', 'Zebra']
    );
  });

  it('excludes a nested folder that merely shares a reserved name (isReservedFolder is path/parentId-aware, not name-only)', () => {
    const parent = makeFolder({
      id: 'parent',
      name: 'Projects',
      path: `${ROOT}/Projects`,
    });
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
    expect(membershipSelector.isWorkspaceFolder(nestedNamedArchive)).toBe(
      false
    );
    expect(membershipSelector.getWorkspaceFolders().map((f) => f.id)).toEqual([
      'parent',
    ]);
  });
});

describe('MembershipSelector.isSystemFolder', () => {
  it('delegates to Vault.isReservedFolder rather than re-deriving reserved-ness', () => {
    const reserved = makeFolder({
      id: 'archive',
      name: 'Archive',
      path: `${ROOT}/Archive`,
    });
    const ordinary = makeFolder({
      id: 'projects',
      name: 'Projects',
      path: `${ROOT}/Projects`,
    });
    const { membershipSelector } = setup([reserved, ordinary]);

    expect(membershipSelector.isSystemFolder(reserved)).toBe(true);
    expect(membershipSelector.isSystemFolder(ordinary)).toBe(false);
  });
});

describe('MembershipSelector dot-prefixed name hiding (UI presentation only, not sync)', () => {
  it('a dot-prefixed root folder (.Project) is discoverable via VaultQuery but hidden from getWorkspaceFolders', () => {
    const visible = makeFolder({ id: 'folder-visible', name: 'Project', path: `${ROOT}/Project` });
    const hidden = makeFolder({ id: 'folder-hidden', name: '.Project', path: `${ROOT}/.Project` });
    const { membershipSelector, query } = setup([visible, hidden]);

    // The underlying vault/query layer still knows about it — nothing
    // about scanning/sync is affected by this UI-only rule.
    expect(query.getRootFolders().map((f) => f.id)).toEqual(
      expect.arrayContaining(['folder-visible', 'folder-hidden'])
    );

    // Only the presentation layer hides it.
    expect(membershipSelector.isWorkspaceFolder(hidden)).toBe(false);
    expect(membershipSelector.isWorkspaceFolder(visible)).toBe(true);
    expect(membershipSelector.getWorkspaceFolders().map((f) => f.id)).toEqual([
      'folder-visible',
    ]);
  });

  it('a well-known dotfolder from another application (.obsidian) is hidden the same way an ordinary dot-prefixed folder is — no app-specific handling', () => {
    const obsidian = makeFolder({ id: 'folder-obsidian', name: '.obsidian', path: `${ROOT}/.obsidian` });
    const { membershipSelector } = setup([obsidian]);

    expect(membershipSelector.isVisibleFolder(obsidian)).toBe(false);
    expect(membershipSelector.getWorkspaceFolders()).toHaveLength(0);
  });

  it('a nested dot-prefixed folder (Project/.Untitled) is hidden one layer below the root, where isWorkspaceFolder does not even apply', () => {
    const parent = makeFolder({ id: 'folder-parent', name: 'Project', path: `${ROOT}/Project` });
    const visibleChild = makeFolder({
      id: 'folder-child-visible',
      name: 'Notes',
      path: `${ROOT}/Project/Notes`,
      parentId: 'folder-parent',
    });
    const hiddenChild = makeFolder({
      id: 'folder-child-hidden',
      name: '.Untitled',
      path: `${ROOT}/Project/.Untitled`,
      parentId: 'folder-parent',
    });
    const { membershipSelector, query } = setup([parent, visibleChild, hiddenChild]);

    // Still fully present structurally.
    expect(query.getChildFolders('folder-parent').map((f) => f.id)).toEqual(
      expect.arrayContaining(['folder-child-visible', 'folder-child-hidden'])
    );

    expect(membershipSelector.getVisibleChildFolders('folder-parent').map((f) => f.id)).toEqual([
      'folder-child-visible',
    ]);
  });

  it('a dot-prefixed page (.Untitled.md) is discoverable via EffectivePageState but hidden from getNotesChildPages/getVisibleChildPages', () => {
    const visible = makePage({ id: 'page-visible', name: 'Note', path: `${ROOT}/Note.md`, parentId: null });
    const hidden = makePage({ id: 'page-hidden', name: '.Untitled', path: `${ROOT}/.Untitled.md`, parentId: null });
    const { membershipSelector, effectivePageState } = setup([], [visible, hidden]);

    expect(effectivePageState.getChildPages(null).map((p) => p.id)).toEqual(
      expect.arrayContaining(['page-visible', 'page-hidden'])
    );

    expect(membershipSelector.getNotesChildPages(null).map((p) => p.id)).toEqual([
      'page-visible',
    ]);
    expect(membershipSelector.getVisibleChildPages(null).map((p) => p.id)).toEqual([
      'page-visible',
    ]);
  });

  it('renaming Project -> .Project flips visibility immediately (the reconciled Vault state is the only input; no separate hidden flag to fall out of sync)', () => {
    const folder = makeFolder({ id: 'folder-1', name: 'Project', path: `${ROOT}/Project` });
    const { membershipSelector, vault } = setup([folder]);

    expect(membershipSelector.getWorkspaceFolders().map((f) => f.id)).toEqual(['folder-1']);

    // Simulates what VaultSyncService.handleMoved does on an external
    // rename: it mutates the Vault directly, never touches this
    // presentation layer.
    vault.moveFolder('folder-1', `${ROOT}/.Project`, null);

    expect(membershipSelector.getWorkspaceFolders()).toHaveLength(0);

    // And back again — visibility recovers immediately, no stale state.
    vault.moveFolder('folder-1', `${ROOT}/Project`, null);
    expect(membershipSelector.getWorkspaceFolders().map((f) => f.id)).toEqual(['folder-1']);
  });
});

describe('MembershipSelector Notes/Daily Notes classification (ADR-023 §4)', () => {
  it('isNotesPage/isDailyNotePage are identity-driven (page.type), independent of folderId', () => {
    const { membershipSelector, effectivePageState } = setup(
      [],
      [
        makePage({ id: 'note-1', type: 'note', parentId: null }),
        makePage({
          id: 'daily-1',
          type: 'daily-note',
          name: '2026-08-05',
          parentId: null,
        }),
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
        makePage({
          id: 'daily-1',
          type: 'daily-note',
          name: '2026-08-05',
          parentId: null,
        }),
      ]
    );

    expect(
      membershipSelector.getNotesChildPages(null).map((p) => p.id)
    ).toEqual(['note-1']);
    expect(
      membershipSelector.getDailyNoteChildPages(null).map((p) => p.id)
    ).toEqual(['daily-1']);
  });
});

describe('MembershipSelector.isArchivedPage', () => {
  it('delegates to the same metadata.status predicate VaultQuery.getArchivedPages uses', () => {
    const archived = makePage({
      id: 'archived-1',
      metadata: { ...defaultPageMetadata, status: 'archived' },
    });
    const active = makePage({ id: 'active-1' });
    const { membershipSelector } = setup([], [archived, active]);

    expect(membershipSelector.isArchivedPage(archived)).toBe(true);
    expect(membershipSelector.isArchivedPage(active)).toBe(false);
  });
});

describe('MembershipSelector.isEffectivelyArchived (ADR-026 §5)', () => {
  it('is false for the vault root (null)', () => {
    const { membershipSelector } = setup();

    expect(membershipSelector.isEffectivelyArchived(null)).toBe(false);
  });

  it('is true for an archived folder itself', () => {
    const archived = makeFolder({
      id: 'folder-1',
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const { membershipSelector } = setup([archived]);

    expect(membershipSelector.isEffectivelyArchived('folder-1')).toBe(true);
  });

  it('is true for a folder nested under an archived ancestor, even though its own status is untouched', () => {
    const archivedParent = makeFolder({
      id: 'folder-parent',
      path: `${ROOT}/Archive/Parent`,
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const activeChild = makeFolder({
      id: 'folder-child',
      path: `${ROOT}/Archive/Parent/Child`,
      parentId: 'folder-parent',
    });
    const { membershipSelector } = setup([archivedParent, activeChild]);

    expect(membershipSelector.isEffectivelyArchived('folder-child')).toBe(true);
  });

  it('is false for an active folder with no archived ancestor', () => {
    const folder = makeFolder({ id: 'folder-1' });
    const { membershipSelector } = setup([folder]);

    expect(membershipSelector.isEffectivelyArchived('folder-1')).toBe(false);
  });
});

describe('MembershipSelector normal-view filtering after folder archive (ADR-026 §5)', () => {
  it('getVisibleChildFolders/getNotesChildPages return nothing for a folder nested inside an archived ancestor, even though their own status is untouched', () => {
    const archivedParent = makeFolder({
      id: 'folder-parent',
      path: `${ROOT}/Archive/Parent`,
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const activeChild = makeFolder({
      id: 'folder-child',
      path: `${ROOT}/Archive/Parent/Child`,
      parentId: 'folder-parent',
    });
    const nestedPage = makePage({
      id: 'page-1',
      path: `${ROOT}/Archive/Parent/Note.md`,
      parentId: 'folder-parent',
    });
    const { membershipSelector } = setup([archivedParent, activeChild], [nestedPage]);

    expect(membershipSelector.getVisibleChildFolders('folder-parent')).toEqual([]);
    expect(membershipSelector.getNotesChildPages('folder-parent')).toEqual([]);
    expect(membershipSelector.getVisibleChildPages('folder-parent')).toEqual([]);
  });

  it('an archived folder itself no longer appears as a child of its former parent — structural exclusion, no predicate needed', () => {
    const root = makeFolder({ id: 'folder-root', path: `${ROOT}/Root` });
    // Simulates the post-archive state: parentId now points at Archive,
    // not folder-root, exactly what Vault.archiveFolder() produces.
    const archived = makeFolder({
      id: 'folder-child',
      path: `${ROOT}/Archive/Child`,
      parentId: 'folder-archive',
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const { membershipSelector } = setup([root, archived]);

    expect(
      membershipSelector.getVisibleChildFolders('folder-root').map((f) => f.id)
    ).toEqual([]);
  });

  it('a sibling folder unaffected by the archived ancestor still renders normally', () => {
    const archivedParent = makeFolder({
      id: 'folder-parent',
      path: `${ROOT}/Archive/Parent`,
      // Mirrors what Vault.archiveFolder() actually produces — the
      // archived folder's own parentId moves to Archive/, it never stays
      // at the root with only its status flipped.
      parentId: 'folder-archive',
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const unrelated = makeFolder({
      id: 'folder-unrelated',
      path: `${ROOT}/Unrelated`,
    });
    const { membershipSelector } = setup([archivedParent, unrelated]);

    expect(
      membershipSelector.getWorkspaceFolders().map((f) => f.id)
    ).toEqual(['folder-unrelated']);
  });
});

describe('MembershipSelector resources', () => {
  it('a normal visible resource is returned as a child of its folder', () => {
    const folder = makeFolder({ id: 'folder-1', path: `${ROOT}/Assets` });
    const resource = makeResource({ id: 'resource-1', parentId: 'folder-1' });
    const { membershipSelector } = setup([folder], [], [resource]);

    expect(
      membershipSelector.getVisibleChildResources('folder-1').map((r) => r.id)
    ).toEqual(['resource-1']);
  });

  it('hides a resource whose name starts with a dot', () => {
    const folder = makeFolder({ id: 'folder-1', path: `${ROOT}/Assets` });
    const visible = makeResource({ id: 'resource-visible', name: 'Cover.png', parentId: 'folder-1' });
    const hidden = makeResource({ id: 'resource-hidden', name: '.Cover.png', parentId: 'folder-1' });
    const { membershipSelector, query } = setup([folder], [], [visible, hidden]);

    // Still fully present structurally — only the presentation layer hides it.
    expect(query.getChildResources('folder-1').map((r) => r.id)).toEqual(
      expect.arrayContaining(['resource-visible', 'resource-hidden'])
    );

    expect(
      membershipSelector.getVisibleChildResources('folder-1').map((r) => r.id)
    ).toEqual(['resource-visible']);
  });

  it('hides a resource that belongs to an archived folder', () => {
    const archived = makeFolder({
      id: 'folder-1',
      path: `${ROOT}/Archive/Assets`,
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const resource = makeResource({ id: 'resource-1', parentId: 'folder-1' });
    const { membershipSelector } = setup([archived], [], [resource]);

    expect(membershipSelector.getVisibleChildResources('folder-1')).toEqual([]);
  });

  it('hides a resource that belongs to a folder nested under an archived ancestor', () => {
    const archivedParent = makeFolder({
      id: 'folder-parent',
      path: `${ROOT}/Archive/Parent`,
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const activeChild = makeFolder({
      id: 'folder-child',
      path: `${ROOT}/Archive/Parent/Child`,
      parentId: 'folder-parent',
    });
    const resource = makeResource({ id: 'resource-1', parentId: 'folder-child' });
    const { membershipSelector } = setup([archivedParent, activeChild], [], [resource]);

    expect(membershipSelector.getVisibleChildResources('folder-child')).toEqual([]);
  });

  it('a sibling resource unaffected by the archived ancestor still renders normally', () => {
    const archivedParent = makeFolder({
      id: 'folder-parent',
      path: `${ROOT}/Archive/Parent`,
      parentId: 'folder-archive',
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const unrelated = makeFolder({ id: 'folder-unrelated', path: `${ROOT}/Unrelated` });
    const resource = makeResource({ id: 'resource-1', parentId: 'folder-unrelated' });
    const { membershipSelector } = setup([archivedParent, unrelated], [], [resource]);

    expect(
      membershipSelector.getVisibleChildResources('folder-unrelated').map((r) => r.id)
    ).toEqual(['resource-1']);
  });

  it('returns a visible root resource (parentId: null)', () => {
    const resource = makeResource({ id: 'resource-1', parentId: null });
    const { membershipSelector } = setup([], [], [resource]);

    expect(membershipSelector.getRootResources().map((r) => r.id)).toEqual([
      'resource-1',
    ]);
  });

  it('hides a dot-prefixed root resource', () => {
    const visible = makeResource({ id: 'resource-visible', name: 'Cover.png', parentId: null });
    const hidden = makeResource({ id: 'resource-hidden', name: '.Cover.png', parentId: null });
    const { membershipSelector } = setup([], [], [visible, hidden]);

    expect(membershipSelector.getRootResources().map((r) => r.id)).toEqual([
      'resource-visible',
    ]);
  });

  it('excludes a resource belonging to a different folder', () => {
    const folderA = makeFolder({ id: 'folder-a', path: `${ROOT}/A` });
    const folderB = makeFolder({ id: 'folder-b', path: `${ROOT}/B` });
    const resource = makeResource({ id: 'resource-1', parentId: 'folder-a' });
    const { membershipSelector } = setup([folderA, folderB], [], [resource]);

    expect(membershipSelector.getVisibleChildResources('folder-b')).toEqual([]);
    expect(
      membershipSelector.getVisibleChildResources('folder-a').map((r) => r.id)
    ).toEqual(['resource-1']);
  });
});
