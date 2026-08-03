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
import { FolderPathResolver } from '@core/application/folder/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildPersistedPage(path: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: { id: 'persisted-page' },
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

function makeVault(pages: Page[]): Vault {
  return new Vault(
    ROOT,
    pages,
    [],
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

function setup(initialPages: Page[] = []) {
  const vault = makeVault(initialPages);
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

  return { vault, query, workspace, pageOperations, effectivePageState };
}

function renderTree(
  query: VaultQuery,
  workspace: Workspace,
  effectivePageState: EffectivePageState
) {
  return render(
    <FolderTree
      query={query}
      workspace={workspace}
      effectivePageState={effectivePageState}
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
    const { query, workspace, pageOperations, effectivePageState } = setup();
    const { rerender } = renderTree(query, workspace, effectivePageState);

    expect(screen.queryByText('New Note')).not.toBeInTheDocument();

    await pageOperations.openDraft({ folderId: null });
    rerender(
      <FolderTree
        query={query}
        workspace={workspace}
        effectivePageState={effectivePageState}
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
    const { query, workspace, pageOperations, effectivePageState } = setup();

    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });
    const { getByText } = renderTree(query, workspace, effectivePageState);

    expect(getByText('My Draft')).toBeInTheDocument();
  });
});

describe('FolderTree: draft discard', () => {
  it('closing an unsaved draft removes it from the tree', async () => {
    const { query, workspace, pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Throwaway' });
    const { rerender, queryByText } = renderTree(query, workspace, effectivePageState);
    expect(queryByText('Throwaway')).toBeInTheDocument();

    pageOperations.close(draftId);

    rerender(
      <FolderTree
        query={query}
        workspace={workspace}
        effectivePageState={effectivePageState}
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

describe('FolderTree: persisted-page rendering is unchanged', () => {
  it('renders an existing persisted page via the same getPageDisplayLabel path as before', () => {
    const page = buildPersistedPage(`${ROOT}/My Persisted Note.md`);
    const { query, workspace, effectivePageState } = setup([page]);

    render(
      <FolderTree
        query={query}
        workspace={workspace}
        effectivePageState={effectivePageState}
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

  it('clicking a persisted page invokes onPageClick with the real Page, unchanged', () => {
    const page = buildPersistedPage(`${ROOT}/Clickable.md`);
    const { query, workspace, effectivePageState } = setup([page]);
    const onPageClick = vi.fn();

    render(
      <FolderTree
        query={query}
        workspace={workspace}
        effectivePageState={effectivePageState}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
      />
    );

    screen.getByText('Clickable').click();

    expect(onPageClick).toHaveBeenCalledWith(expect.objectContaining({ id: page.id }));
  });
});

describe('FolderTree: draft promotion', () => {
  it('never renders the same page twice across the promotion window', async () => {
    const { query, workspace, pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Promote Me' });
    const { rerender, getAllByText } = renderTree(query, workspace, effectivePageState);
    expect(getAllByText('Promote Me')).toHaveLength(1);

    await pageOperations.save(draftId, '# Hello');

    rerender(
      <FolderTree
        query={query}
        workspace={workspace}
        effectivePageState={effectivePageState}
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
