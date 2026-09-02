// @vitest-environment jsdom

// No global jest-dom setup exists in this project's vitest config yet
// (NewFolderRow.test.tsx, the only other component test, doesn't need
// these matchers) — imported locally rather than adding project-wide
// config for one test file.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderTree } from './FolderTree';
import { PageOperations } from '@core/application/page/PageOperations';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '@core/workspace/Workspace';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
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
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultResource } from '@core/vault/models/VaultResource';

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildPersistedPage(
  path: string,
  overrides: {
    icon?: string;
    description?: string;
    parentId?: string | null;
  } = {}
): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: overrides.parentId ?? null,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: {
        id: 'persisted-page',
        icon: overrides.icon,
        description: overrides.description,
      },
      frontmatterAnalysis: { aliases: [] },
      content: 'Original body',
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

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'photo.png',
    path: `${ROOT}/photo.png`,
    parentId: null,
    ...overrides,
  };
}

function makeVault(
  pages: Page[],
  folders: Folder[] = [],
  resources: VaultResource[] = []
): Vault {
  return new Vault(
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

function setup(
  initialPages: Page[] = [],
  initialFolders: Folder[] = [],
  initialResources: VaultResource[] = []
) {
  const vault = makeVault(initialPages, initialFolders, initialResources);
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();

  for (const page of initialPages) {
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

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

function renderTree(
  query: VaultQuery,
  membershipSelector: MembershipSelector,
  workspace: Workspace,
  onResourceClick: (resource: VaultResource) => void = vi.fn()
) {
  return render(
    <FolderTree
      query={query}
      membershipSelector={membershipSelector}
      workspace={workspace}
      parentId={null}
      level={0}
      onPageClick={vi.fn()}
      onDraftPageClick={vi.fn()}
      onFolderClick={vi.fn()}
      onResourceClick={onResourceClick}
      onCreateNote={vi.fn()}
      pendingNewFolder={null}
      onCommitNewFolder={vi.fn()}
      onCancelNewFolder={vi.fn()}
    />
  );
}

describe('FolderTree: draft-only entries appear immediately (ADR-020, M3)', () => {
  it('a freshly created draft appears in the tree before any save', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();
    const { rerender } = renderTree(query, membershipSelector, workspace);

    expect(screen.queryByText('New Note')).not.toBeInTheDocument();

    await pageOperations.openDraft({ folderId: null });
    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    // No explicit title was given, so it falls back to the same shared
    // placeholder copy the rest of the app already uses for an untitled
    // page — not a new label, an existing one applied to a new case.
    expect(screen.getByText('New Note')).toBeInTheDocument();
  });

  it('a titled draft renders its title immediately', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });
    const { getByText } = renderTree(query, membershipSelector, workspace);

    expect(getByText('My Draft')).toBeInTheDocument();
  });
});

describe('FolderTree: draft click routing', () => {
  it('clicking a draft row invokes onDraftPageClick, not onPageClick (open() would throw for a draft)', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();
    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });

    const onPageClick = vi.fn();
    const onDraftPageClick = vi.fn();

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={onDraftPageClick}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    screen.getByText('My Draft').click();

    expect(onDraftPageClick).toHaveBeenCalledWith(expect.any(String));
    expect(onPageClick).not.toHaveBeenCalled();
  });
});

describe('FolderTree: draft discard', () => {
  it('closing an unsaved draft removes it from the tree', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    const draftId = await pageOperations.openDraft({
      folderId: null,
      title: 'Throwaway',
    });
    const { rerender, queryByText } = renderTree(
      query,
      membershipSelector,
      workspace
    );
    expect(queryByText('Throwaway')).toBeInTheDocument();

    pageOperations.close(draftId);

    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(queryByText('Throwaway')).not.toBeInTheDocument();
  });
});

describe('FolderTree: reusable-draft policy (PageOperations.findReusableDraftId) surfaces correctly here', () => {
  it('clicking "New Note" twice without saving shows exactly one placeholder row, not two', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    await pageOperations.openDraft({ folderId: null });
    await pageOperations.openDraft({ folderId: null });

    const { getAllByText } = renderTree(query, membershipSelector, workspace);

    expect(getAllByText('New Note')).toHaveLength(1);
  });

  it('a draft with real content is not distinguished by body text — both unsaved drafts show "New Note"', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    const firstId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(firstId, 'Real content');
    await pageOperations.openDraft({ folderId: null });

    const { getAllByText, queryByText } = renderTree(
      query,
      membershipSelector,
      workspace
    );

    expect(queryByText('Real content')).not.toBeInTheDocument();
    expect(getAllByText('New Note')).toHaveLength(2);
  });
});

describe('FolderTree: persisted-page rendering is unchanged', () => {
  it('renders an existing persisted page via the same getPageDisplayLabel path as before', () => {
    const page = buildPersistedPage(`${ROOT}/My Persisted Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('My Persisted Note')).toBeInTheDocument();
  });

  it('shows the placeholder, not the durable description, when the filename is auto-generated', () => {
    const page = buildPersistedPage(`${ROOT}/Untitled.md`, {
      description: 'A durable description',
    });
    const { query, workspace, membershipSelector } = setup([page]);

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.queryByText('A durable description')).not.toBeInTheDocument();
    expect(screen.getByText('New Note')).toBeInTheDocument();
  });

  it('clicking a persisted page invokes onPageClick with its id (not a draft click)', () => {
    const page = buildPersistedPage(`${ROOT}/Clickable.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const onPageClick = vi.fn();
    const onDraftPageClick = vi.fn();

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={onDraftPageClick}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    screen.getByText('Clickable').click();

    expect(onPageClick).toHaveBeenCalledWith(page.id);
    expect(onDraftPageClick).not.toHaveBeenCalled();
  });
});

describe('FolderTree: Daily Note membership (ADR-023) — the bug this phase fixes', () => {
  it('a Daily Note draft with no month folder yet (folderId: null) does NOT appear in Notes', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    // Mirrors Application.open()'s boot sequence for today's note: no
    // "Daily Notes/<year>/<month>" folder chain exists yet in a fresh
    // vault, so the resulting draft's folderId is null — previously
    // indistinguishable, to FolderTree, from a root-level Note.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-20.md`,
      {
        type: 'daily-note',
      }
    );

    renderTree(query, membershipSelector, workspace);

    expect(screen.queryByText('Start typing...')).not.toBeInTheDocument();
  });

  it('an ordinary Note draft with folderId: null still appears in Notes (the classification is type-based, not a blanket exclusion)', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });

    renderTree(query, membershipSelector, workspace);

    expect(screen.getByText('My Draft')).toBeInTheDocument();
  });

  // Empirical check requested alongside the classification-hardening work:
  // a persisted, type: 'note' page whose path physically sits inside a
  // real Daily Notes month folder (e.g. an external file dropped next to a
  // real Daily Note) is invisible here — NOT because getNotesChildPages
  // filters it out by page.type (it wouldn't; see the folderId:null test
  // above), but because FolderTree's root-level traversal starts from
  // membershipSelector.getWorkspaceFolders(), which excludes Daily Notes
  // itself (a reserved folder, isWorkspaceFolder) before recursion ever
  // begins — so the tree never reaches "Daily Notes/2026/August" as a
  // folder to call getNotesChildPages(folder.id) on in the first place.
  // This is a location-based folder-tree exclusion, orthogonal to the
  // type-based page filter — no new membership logic is added by this
  // test, it only documents the existing outcome.
  it('a persisted Note physically located inside a Daily Notes month folder does NOT appear in Notes — FolderTree never descends into Daily Notes at all', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const dailyNote: Page = {
      id: 'daily-1',
      type: 'daily-note',
      name: '2026-08-12',
      path: `${ROOT}/Daily Notes/2026/August/2026-08-12.md`,
      parentId: 'month-august',
      metadata: {
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
      },
      source: { markdown: '' },
      analysis: {
        headings: [],
        aliases: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    };
    const strayNote: Page = {
      ...dailyNote,
      id: 'note-1',
      type: 'note',
      name: 'Test file',
      path: `${ROOT}/Daily Notes/2026/August/Test file.md`,
    };
    const { query, workspace, membershipSelector } = setup(
      [dailyNote, strayNote],
      [dailyNotesRoot, year, month]
    );

    renderTree(query, membershipSelector, workspace);

    // Neither page renders in Notes — the Daily Note correctly doesn't
    // (it never did), but the stray Note doesn't either, despite
    // page.type === 'note' being exactly what getNotesChildPages filters
    // for. There is simply no folder row in this tree whose id is
    // "month-august" to call getNotesChildPages on.
    expect(screen.queryByText('Test file')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-08-12')).not.toBeInTheDocument();
    expect(screen.queryByText('August')).not.toBeInTheDocument();
  });
});

describe('FolderTree: draft promotion', () => {
  it('never renders the same page twice across the promotion window', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    const draftId = await pageOperations.openDraft({
      folderId: null,
      title: 'Promote Me',
    });
    const { rerender, getAllByText } = renderTree(
      query,
      membershipSelector,
      workspace
    );
    expect(getAllByText('Promote Me')).toHaveLength(1);

    await pageOperations.save(draftId, '# Hello');

    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    // Now rendered via the durable (query-driven) path, not the draft
    // overlay — still exactly one row, never both simultaneously.
    expect(getAllByText('Promote Me')).toHaveLength(1);
  });
});

describe('FolderTree: folder expansion completes an existing Workspace capability (ADR-021)', () => {
  it('a folder is expanded by default — children render with no prior toggle', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const page = buildPersistedPage(`${ROOT}/Projects/Roadmap.md`, {
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([page], [folder]);

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('collapsing a folder hides its pages and subfolders; expanding again restores them', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const page = buildPersistedPage(`${ROOT}/Projects/Roadmap.md`, {
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([page], [folder]);

    const { rerender } = render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('Roadmap')).toBeInTheDocument();

    workspace.toggleFolderExpanded('folder-1');
    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();

    workspace.toggleFolderExpanded('folder-1');
    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('clicking the caret toggles expansion without invoking onFolderClick (the row navigate handler)', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const page = buildPersistedPage(`${ROOT}/Projects/Roadmap.md`, {
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([page], [folder]);
    const onFolderClick = vi.fn();

    const { container } = render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={onFolderClick}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(workspace.isFolderExpanded('folder-1')).toBe(true);

    const caret = container.querySelector('.folder__caret .caret-slot');

    if (!caret) {
      throw new Error('expected a caret button to be rendered');
    }

    (caret as HTMLElement).click();

    expect(workspace.isFolderExpanded('folder-1')).toBe(false);
    expect(onFolderClick).not.toHaveBeenCalled();
  });
});

describe('FolderTree: create note from folder ("+" button)', () => {
  function clickAddButton(folderTitle: string) {
    const row = screen.getByText(folderTitle).closest('.entry');

    if (!row) {
      throw new Error(`expected an entry row for "${folderTitle}"`);
    }

    const addButton = row.querySelector('.entry__actions button');

    if (!addButton) {
      throw new Error(`expected a "+" button on the "${folderTitle}" row`);
    }

    (addButton as HTMLElement).click();
  }

  it('clicking a root folder\'s "+" invokes onCreateNote with that folder\'s id, not onFolderClick', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const onFolderClick = vi.fn();
    const onCreateNote = vi.fn();

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={onFolderClick}
        onCreateNote={onCreateNote}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    clickAddButton('Projects');

    expect(onCreateNote).toHaveBeenCalledWith('folder-1');
    expect(onFolderClick).not.toHaveBeenCalled();
  });

  it('clicking a nested folder\'s "+" invokes onCreateNote with the nested folder\'s id', () => {
    const parent = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const child = makeFolder('folder-2', `${ROOT}/Projects/Q1`, 'folder-1');
    const { query, workspace, membershipSelector } = setup([], [parent, child]);
    const onCreateNote = vi.fn();

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={onCreateNote}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    clickAddButton('Q1');

    expect(onCreateNote).toHaveBeenCalledWith('folder-2');
  });

  it('a draft opened via pageOperations.openDraft({ folderId }) appears immediately under that folder, before any save', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, pageOperations, membershipSelector } = setup(
      [],
      [folder]
    );
    const { rerender } = renderTree(query, membershipSelector, workspace);

    expect(screen.queryByText('New Note')).not.toBeInTheDocument();

    await pageOperations.openDraft({ folderId: 'folder-1' });
    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('New Note')).toBeInTheDocument();
    expect(workspace.activePageId).toBeDefined();
  });

  it('drafts opened in two different folders each render only under their own folder', async () => {
    const folderA = makeFolder('folder-a', `${ROOT}/A`, null);
    const folderB = makeFolder('folder-b', `${ROOT}/B`, null);
    const { query, workspace, pageOperations, membershipSelector } = setup(
      [],
      [folderA, folderB]
    );

    const draftA = await pageOperations.openDraft({ folderId: 'folder-a' });
    pageOperations.commitEdit(draftA, 'Real content');
    await pageOperations.openDraft({ folderId: 'folder-b' });

    const { container } = renderTree(query, membershipSelector, workspace);

    const rowA = screen.getByText('A').closest('.entry');
    const rowB = screen.getByText('B').closest('.entry');

    if (!rowA || !rowB) {
      throw new Error('expected both folder rows to render');
    }

    // Expand both folders so their children render (default-expanded per
    // ADR-021, but assert explicitly rather than relying on it silently).
    expect(workspace.isFolderExpanded('folder-a')).toBe(true);
    expect(workspace.isFolderExpanded('folder-b')).toBe(true);

    expect(container.querySelectorAll('.entry').length).toBeGreaterThan(2);
    // Both drafts show the placeholder — a Note's title never derives from
    // body content, even for a draft with real, uncommitted content — but
    // they still render as two distinct rows, one under each folder.
    expect(screen.getAllByText('New Note')).toHaveLength(2);
  });
});

describe('FolderTree: resources', () => {
  it('a resource appears inside the folder it physically exists in', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const resource = makeResource({
      id: 'resource-1',
      name: 'floorplan.png',
      path: `${ROOT}/Projects/floorplan.png`,
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([], [folder], [resource]);

    renderTree(query, membershipSelector, workspace);

    expect(screen.getByText('floorplan.png')).toBeInTheDocument();
  });

  it('a resource appears at the vault root, alongside root pages', () => {
    const page = buildPersistedPage(`${ROOT}/Ideas.md`);
    const resource = makeResource({
      id: 'resource-1',
      name: 'brochure.pdf',
      kind: 'pdf',
      path: `${ROOT}/brochure.pdf`,
      parentId: null,
    });
    const { query, workspace, membershipSelector } = setup([page], [], [resource]);

    renderTree(query, membershipSelector, workspace);

    expect(screen.getByText('Ideas')).toBeInTheDocument();
    expect(screen.getByText('brochure.pdf')).toBeInTheDocument();
  });

  it('a resource physically located outside Assets/ (e.g. inside a plain user folder) is visible — resources are not restricted to Assets/', () => {
    const projects = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const resource = makeResource({
      id: 'resource-1',
      name: 'floorplan.png',
      path: `${ROOT}/Projects/floorplan.png`,
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([], [projects], [resource]);

    renderTree(query, membershipSelector, workspace);

    expect(screen.getByText('floorplan.png')).toBeInTheDocument();
  });

  it('a folder containing only resources (no pages, no subfolders) is not treated as empty', () => {
    const assets = makeFolder('folder-1', `${ROOT}/Assets`, null);
    const resource = makeResource({
      id: 'resource-1',
      name: 'photo.png',
      path: `${ROOT}/Assets/photo.png`,
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([], [assets], [resource]);

    renderTree(query, membershipSelector, workspace);

    const row = screen.getByText('Assets').closest('.entry');
    expect(row).not.toBeNull();
    // FolderLeading (Caret.tsx) disables the caret button exactly when
    // isEmpty is true — the most direct signal available from rendered
    // output. A folder holding only a resource must not disable it.
    const caretButton = row!.querySelector('.caret-slot') as HTMLButtonElement;
    expect(caretButton).not.toBeNull();
    expect(caretButton.disabled).toBe(false);
  });

  it('existing Markdown page rendering is unchanged when resources are also present in the same folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const page = buildPersistedPage(`${ROOT}/Projects/House.md`, {
      parentId: 'folder-1',
    });
    const resource = makeResource({
      id: 'resource-1',
      name: 'floorplan.png',
      path: `${ROOT}/Projects/floorplan.png`,
      parentId: 'folder-1',
    });
    const { query, workspace, membershipSelector } = setup([page], [folder], [resource]);

    renderTree(query, membershipSelector, workspace);

    expect(screen.getByText('House')).toBeInTheDocument();
    expect(screen.getByText('floorplan.png')).toBeInTheDocument();
  });

  it('clicking an image resource invokes onResourceClick with the resource', () => {
    const resource = makeResource({
      id: 'resource-1',
      name: 'photo.png',
      kind: 'image',
      path: `${ROOT}/photo.png`,
      parentId: null,
    });
    const { query, workspace, membershipSelector } = setup([], [], [resource]);
    const onResourceClick = vi.fn();

    renderTree(query, membershipSelector, workspace, onResourceClick);

    screen.getByText('photo.png').click();

    expect(onResourceClick).toHaveBeenCalledWith(resource);
  });

  it('clicking a pdf resource does nothing', () => {
    const resource = makeResource({
      id: 'resource-1',
      name: 'brochure.pdf',
      kind: 'pdf',
      path: `${ROOT}/brochure.pdf`,
      parentId: null,
    });
    const { query, workspace, membershipSelector } = setup([], [], [resource]);
    const onResourceClick = vi.fn();

    renderTree(query, membershipSelector, workspace, onResourceClick);

    screen.getByText('brochure.pdf').click();

    expect(onResourceClick).not.toHaveBeenCalled();
  });
});
