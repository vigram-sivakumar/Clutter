import { describe, expect, it, vi } from 'vitest';
import { buildBreadcrumbs, buildBreadcrumbsForDraft } from './buildBreadcrumbs';
import { getPageIcon } from './getPageIcon';
import { getSystemLocationPresentation } from './systemPresentation';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { Vault } from '../vault/models/Vault';
import { VaultQuery } from '../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import type { Folder } from '../vault/models/Folder';
import type { Page } from '../vault/models/Page';
import { MembershipSelector } from '../application/membership/MembershipSelector';
import { EffectivePageState } from '../application/page/EffectivePageState';
import { PageOperations } from '../application/page/PageOperations';
import { PagePersistenceCoordinator } from '../vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '../engine/DocumentRegistry';
import { SaveCoordinator } from '../engine/SaveCoordinator';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../vault/ingest/PageRebuilder';
import { MoveService } from '../vault/persistence/MoveService';
import { PagePathResolver } from '../application/page/PagePathResolver';
import { PageCreator } from '../application/page/PageCreator';
import { PageFactory } from '../application/page/PageFactory';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../application/folder/FolderOperations';
import { FolderPathResolver } from '../application/folder/FolderPathResolver';
import { FolderCreator } from '../application/folder/FolderCreator';
import { DailyNoteService } from '../application/daily-notes/DailyNoteService';
import { Workspace } from '../workspace/Workspace';

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
    name: 'Projects',
    path: `${ROOT}/Projects`,
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

function makeVault(folders: Folder[] = []): Vault {
  return new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

// ADR-023: buildBreadcrumbs/buildBreadcrumbsForDraft route their
// system-folder check through MembershipSelector rather than
// Vault.isReservedFolder() directly — this constructs the full dependency
// chain MembershipSelector needs, mirroring the setup() helper other
// application-layer test files (FolderTree.test.tsx, etc.) already use.
// isReservedFolder/isSystemFolder are pure functions of the folder
// argument plus the constant vault root, so a MembershipSelector built
// from an independently-constructed Vault with the same folder list
// behaves identically to one built from the exact instance under test.
function makeMembershipSelector(vault: Vault): MembershipSelector {
  const query = new VaultQuery(vault);
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const fileSystem = new InMemoryVaultFileSystem();
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
    new DailyNoteService()
  );
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);

  return new MembershipSelector(vault, query, effectivePageState);
}

// A non-root ancestor folder, shared by every "trailing crumb" / "icon"
// test below so those tests exercise the trailing-crumb content in
// isolation from the root-visibility policy (covered separately below).
function makeAncestorFolder(overrides: Partial<Folder> = {}): Folder {
  return makeFolder({
    id: 'ancestor-folder',
    name: 'Ancestor',
    parentId: null,
    ...overrides,
  });
}

describe('buildBreadcrumbs — root visibility policy', () => {
  it('returns no breadcrumb trail for a root folder', () => {
    const folder = makeFolder({ parentId: null });
    const crumbs = buildBreadcrumbs(folder, makeVault(), makeMembershipSelector(makeVault()), vi.fn());

    expect(crumbs).toEqual([]);
  });

  it('returns no breadcrumb trail for a root note', () => {
    const page = makePage({ parentId: null });
    const crumbs = buildBreadcrumbs(page, makeVault(), makeMembershipSelector(makeVault()), vi.fn());

    expect(crumbs).toEqual([]);
  });

  it('returns no breadcrumb trail for a root daily note', () => {
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: null,
    });
    const crumbs = buildBreadcrumbs(page, makeVault(), makeMembershipSelector(makeVault()), vi.fn());

    expect(crumbs).toEqual([]);
  });
});

describe('buildBreadcrumbsForDraft — root visibility policy', () => {
  it('returns no breadcrumb trail for a root draft', () => {
    const crumbs = buildBreadcrumbsForDraft(
      'draft-1',
      null,
      'New Note',
      'note',
      makeVault(),
      makeMembershipSelector(makeVault()),
      vi.fn()
    );

    expect(crumbs).toEqual([]);
  });
});

describe('buildBreadcrumbs — nested entries render the full chain', () => {
  it('returns the parent folder plus the current folder for a nested folder', () => {
    const parent = makeAncestorFolder();
    const folder = makeFolder({
      id: 'folder-child',
      name: 'Design',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(folder, makeVault([parent, folder]), makeMembershipSelector(makeVault([parent, folder])), vi.fn());

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', 'Design']);
  });

  it('returns the parent folder plus the current note for a nested note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ name: 'Meeting Notes', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', 'Meeting Notes']);
  });

  it('returns the parent folder plus the current daily note for a nested daily note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', '2026-08-02']);
  });
});

describe('buildBreadcrumbsForDraft — nested drafts render the full chain', () => {
  it('returns the parent folder plus the draft for a nested draft', () => {
    const parent = makeAncestorFolder();
    const crumbs = buildBreadcrumbsForDraft(
      'draft-1',
      'ancestor-folder',
      'New Note',
      'note',
      makeVault([parent]),
      makeMembershipSelector(makeVault([parent])),
      vi.fn()
    );

    expect(crumbs.map((crumb) => crumb.title)).toEqual(['Ancestor', 'New Note']);
  });
});

describe('buildBreadcrumbs — trailing crumb (Category B)', () => {
  it('uses the real name for a folder', () => {
    const parent = makeAncestorFolder();
    const folder = makeFolder({ name: 'Projects', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(folder, makeVault([parent, folder]), makeMembershipSelector(makeVault([parent, folder])), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('Projects');
  });

  it('uses the real filename for a deliberately-named note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ name: 'Meeting Notes', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('Meeting Notes');
  });

  it('shows the placeholder text, not the raw generated name, for an untitled note', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ name: 'Untitled 2', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('New Note');
  });

  it('always shows the real date for a daily note, never a placeholder', () => {
    const parent = makeAncestorFolder();
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.at(-1)!.title).toBe('2026-08-02');
  });
});

describe('buildBreadcrumbs — icon sourced from getPageIcon (single authority)', () => {
  it('uses getPageIcon for a folder crumb', () => {
    const parent = makeAncestorFolder();
    const folder = makeFolder({ parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(folder, makeVault([parent, folder]), makeMembershipSelector(makeVault([parent, folder])), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('folder'));
  });

  it('uses getPageIcon for a note crumb', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ type: 'note', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('note'));
  });

  it('uses getPageIcon for a daily-note crumb', () => {
    const parent = makeAncestorFolder();
    const page = makePage({
      type: 'daily-note',
      name: '2026-08-02',
      parentId: 'ancestor-folder',
    });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('daily-note'));
  });

  it('uses getPageIcon for an ancestor folder crumb', () => {
    const parent = makeFolder({ id: 'folder-1', name: 'Projects', parentId: null });
    const page = makePage({ parentId: 'folder-1' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs[0]!.icon).toBe(getPageIcon('folder'));
  });

  it('uses getPageIcon for a draft crumb', () => {
    const parent = makeAncestorFolder();
    const crumbs = buildBreadcrumbsForDraft(
      'draft-1',
      'ancestor-folder',
      'New Note',
      'note',
      makeVault([parent]),
      makeMembershipSelector(makeVault([parent])),
      vi.fn()
    );

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('note'));
  });
});

describe('buildBreadcrumbs — reserved-folder ancestors use their canonical system-location presentation', () => {
  it('shows the canonical icon and label for an Archive ancestor, not the generic folder icon and raw name', () => {
    const archive = makeFolder({
      id: 'archive-folder',
      name: 'Archive',
      path: `${ROOT}/Archive`,
      parentId: null,
    });
    const page = makePage({ parentId: 'archive-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([archive]), makeMembershipSelector(makeVault([archive])), vi.fn());

    const archiveCrumb = crumbs[0]!;
    expect(archiveCrumb.title).toBe(getSystemLocationPresentation('archive').label);
    expect(archiveCrumb.icon).toBe(getSystemLocationPresentation('archive').icon);
    expect(archiveCrumb.icon).not.toBe(getPageIcon('folder'));
  });

  it('shows the canonical icon and label for an Inbox/Templates ancestor too', () => {
    const inbox = makeFolder({
      id: 'inbox-folder',
      name: 'Inbox',
      path: `${ROOT}/Inbox`,
      parentId: null,
    });
    const page = makePage({ parentId: 'inbox-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([inbox]), makeMembershipSelector(makeVault([inbox])), vi.fn());

    expect(crumbs[0]!.title).toBe(getSystemLocationPresentation('inbox').label);
    expect(crumbs[0]!.icon).toBe(getSystemLocationPresentation('inbox').icon);
  });

  it('does not apply system-location presentation to an ordinary folder that merely shares a reserved name at a non-root path', () => {
    // "Archive" only counts as reserved when it is a real top-level Vault
    // folder (Vault.isReservedFolder checks parentId === null AND the
    // exact reserved path) — a user-created nested folder that happens to
    // be named "Archive" must not be hijacked into the reserved
    // presentation.
    const grandparent = makeFolder({ id: 'grandparent', name: 'Projects', parentId: null });
    const nestedArchive = makeFolder({
      id: 'nested-archive',
      name: 'Archive',
      parentId: 'grandparent',
    });
    const page = makePage({ parentId: 'nested-archive' });
    const crumbs = buildBreadcrumbs(page, makeVault([grandparent, nestedArchive]), makeMembershipSelector(makeVault([grandparent, nestedArchive])), vi.fn());

    const nestedArchiveCrumb = crumbs[1]!;
    expect(nestedArchiveCrumb.title).toBe('Archive');
    expect(nestedArchiveCrumb.icon).toBe(getPageIcon('folder'));
  });

  it('leaves an ordinary, non-reserved folder ancestor exactly as before', () => {
    const parent = makeAncestorFolder({ name: 'Projects' });
    const page = makePage({ parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs[0]!.title).toBe('Projects');
    expect(crumbs[0]!.icon).toBe(getPageIcon('folder'));
  });
});

describe("buildBreadcrumbs — today's Daily Note gets the dotted calendar icon", () => {
  it("uses the dotted calendar icon for today's persisted daily note, not a non-today one", () => {
    const parent = makeAncestorFolder();
    const today = makePage({
      type: 'daily-note',
      name: toISODate(new Date()),
      parentId: 'ancestor-folder',
    });
    const notToday = makePage({
      type: 'daily-note',
      name: '2020-01-01',
      parentId: 'ancestor-folder',
    });

    const todayCrumbs = buildBreadcrumbs(today, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());
    const notTodayCrumbs = buildBreadcrumbs(notToday, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(todayCrumbs.at(-1)!.icon).toBe(getPageIcon('daily-note', true));
    expect(notTodayCrumbs.at(-1)!.icon).toBe(getPageIcon('daily-note', false));
    expect(todayCrumbs.at(-1)!.icon).not.toBe(notTodayCrumbs.at(-1)!.icon);
  });

  it("uses the dotted calendar icon for today's Daily Note draft (title doubles as its date)", () => {
    const parent = makeAncestorFolder();

    const todayCrumbs = buildBreadcrumbsForDraft(
      'draft-1',
      'ancestor-folder',
      toISODate(new Date()),
      'daily-note',
      makeVault([parent]),
      makeMembershipSelector(makeVault([parent])),
      vi.fn()
    );
    const notTodayCrumbs = buildBreadcrumbsForDraft(
      'draft-2',
      'ancestor-folder',
      '2020-01-01',
      'daily-note',
      makeVault([parent]),
      makeMembershipSelector(makeVault([parent])),
      vi.fn()
    );

    expect(todayCrumbs.at(-1)!.icon).toBe(getPageIcon('daily-note', true));
    expect(notTodayCrumbs.at(-1)!.icon).toBe(getPageIcon('daily-note', false));
  });

  it('never applies the dotted variant to a regular note, even if its type check were skipped', () => {
    const parent = makeAncestorFolder();
    const page = makePage({ type: 'note', name: 'Untitled', parentId: 'ancestor-folder' });
    const crumbs = buildBreadcrumbs(page, makeVault([parent]), makeMembershipSelector(makeVault([parent])), vi.fn());

    expect(crumbs.at(-1)!.icon).toBe(getPageIcon('note'));
  });
});
