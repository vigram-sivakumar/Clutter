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

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildPersistedPage(
  path: string,
  overrides: { icon?: string; description?: string; parentId?: string | null } = {}
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

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
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
    () => {}
  );
}

function setup(initialPages: Page[] = [], initialFolders: Folder[] = []) {
  const vault = makeVault(initialPages, initialFolders);
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
    new DailyNoteService()
  );
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);

  return { vault, query, workspace, pageOperations, effectivePageState, membershipSelector };
}

function renderTree(
  query: VaultQuery,
  membershipSelector: MembershipSelector,
  workspace: Workspace
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

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Throwaway' });
    const { rerender, queryByText } = renderTree(query, membershipSelector, workspace);
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

  it('a draft with real content is left alone — a second "New Note" click shows two distinct rows', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    const firstId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(firstId, 'Real content');
    await pageOperations.openDraft({ folderId: null });

    const { getAllByText, getByText } = renderTree(query, membershipSelector, workspace);

    expect(getByText('Real content')).toBeInTheDocument();
    expect(getAllByText('New Note')).toHaveLength(1);
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
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('My Persisted Note')).toBeInTheDocument();
  });

  it('renders the durable description as the label when the filename is auto-generated (EffectivePageState M3 amendment)', () => {
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
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('A durable description')).toBeInTheDocument();
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
    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    renderTree(query, membershipSelector, workspace);

    expect(screen.queryByText('Start typing...')).not.toBeInTheDocument();
  });

  it('an ordinary Note draft with folderId: null still appears in Notes (the classification is type-based, not a blanket exclusion)', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });

    renderTree(query, membershipSelector, workspace);

    expect(screen.getByText('My Draft')).toBeInTheDocument();
  });
});

describe('FolderTree: draft promotion', () => {
  it('never renders the same page twice across the promotion window', async () => {
    const { query, workspace, pageOperations, membershipSelector } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Promote Me' });
    const { rerender, getAllByText } = renderTree(query, membershipSelector, workspace);
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
    const page = buildPersistedPage(`${ROOT}/Projects/Roadmap.md`, { parentId: 'folder-1' });
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
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('collapsing a folder hides its pages and subfolders; expanding again restores them', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const page = buildPersistedPage(`${ROOT}/Projects/Roadmap.md`, { parentId: 'folder-1' });
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
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('clicking the caret toggles expansion without invoking onFolderClick (the row navigate handler)', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const page = buildPersistedPage(`${ROOT}/Projects/Roadmap.md`, { parentId: 'folder-1' });
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
