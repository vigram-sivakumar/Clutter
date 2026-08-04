// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesList } from './DailyNotesList';
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

afterEach(() => {
  cleanup();
});

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

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function makeDailyNote(id: string, name: string, parentId: string): Page {
  return {
    id,
    type: 'daily-note',
    name,
    path: `${ROOT}/Daily Notes/2026/August/${name}.md`,
    parentId,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
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

function setup(pages: Page[], folders: Folder[]) {
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

describe('DailyNotesList — empty month sections', () => {
  it('does not render a month section with no Daily Notes in it', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    // A month folder with zero Daily Notes inside — the empty-section case.
    const emptyMonth = makeFolder(
      'month-july',
      `${ROOT}/Daily Notes/2026/July`,
      'year-2026'
    );
    const { vault, query, effectivePageState, workspace } = setup(
      [],
      [dailyNotesRoot, year, emptyMonth]
    );

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // Regex (not an exact string) so this doesn't depend on whether
    // formatMonthSectionTitle renders "July" or "July 2026" (isCurrentYear
    // is wall-clock-dependent, not something this test should assume).
    expect(screen.queryByText(/July/)).toBeNull();
  });

  it('renders a month section that has at least one Daily Note', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const note = makeDailyNote('daily-1', '2026-08-15', 'month-august');
    const { vault, query, effectivePageState, workspace } = setup(
      [note],
      [dailyNotesRoot, year, month]
    );

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.queryByText(/August/)).not.toBeNull();
  });
});

describe('DailyNotesList — sidebar membership is durable-only — drafts are not sidebar items', () => {
  it('a Daily Note draft opened via openAtPath does not appear, and its now-empty month section does not render either', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const { pageOperations, vault, query, effectivePageState, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // EffectivePageState still reconciled the draft (isDraft: true) —
    // the editor session exists — but DailyNotesList filters it out, and
    // since it was the month's only entry, the month section itself has
    // nothing left to show (same empty-section rule as above).
    expect(screen.queryByText(/August/)).toBeNull();
    expect(screen.queryByText('Start typing...')).toBeNull();
  });

  it('the same draft appears — inside its month section — only once it is saved (first persist)', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const { pageOperations, vault, query, effectivePageState, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    const draftId = await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-20.md`,
      { type: 'daily-note' }
    );

    const { rerender } = render(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.queryByText(/August/)).toBeNull();

    await pageOperations.save(draftId, '# Hello');

    rerender(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // Now a real Vault page — the month section and its row appear for
    // the first time here, via the durable (query-driven) path. Label
    // comes from the saved body's primary content ("Hello"), not the
    // placeholder, since real content now exists.
    expect(screen.queryByText(/August/)).not.toBeNull();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('clicking a persisted Daily Note (not a draft) calls onOpen, not onOpenDraft', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const note = makeDailyNote('daily-1', '2026-08-21', 'month-august');
    const { vault, query, effectivePageState, workspace } = setup(
      [note],
      [dailyNotesRoot, year, month]
    );

    const onOpen = vi.fn();
    const onOpenDraft = vi.fn();

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={onOpen}
        onOpenDraft={onOpenDraft}
        onOpenFolder={vi.fn()}
      />
    );

    screen.getByText('Start typing...').click();

    expect(onOpen).toHaveBeenCalledWith('daily-1');
    expect(onOpenDraft).not.toHaveBeenCalled();
  });
});

describe('DailyNotesList — today has no dedicated section', () => {
  it("renders today's note inside its month section, not as a separate heading or row", () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const today = makeDailyNote('daily-today', '2026-08-15', 'month-august');
    const other = makeDailyNote('daily-other', '2026-08-10', 'month-august');
    const { vault, query, effectivePageState, workspace } = setup(
      [today, other],
      [dailyNotesRoot, year, month]
    );

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        effectivePageState={effectivePageState}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // No dedicated "Today" heading — only the month heading exists, and
    // both notes render once each, purely as members of that one section.
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.getAllByText(/August/)).toHaveLength(1);
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });
});
