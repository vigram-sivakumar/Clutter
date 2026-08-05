// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesList } from './DailyNotesList';
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
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator()
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
    new DailyNoteService(),
    () => {}
  );
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);

  return { vault, query, workspace, pageOperations, membershipSelector };
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
    const { vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, emptyMonth]
    );

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
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
    const { vault, query, membershipSelector, workspace } = setup(
      [note],
      [dailyNotesRoot, year, month]
    );

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.queryByText(/August/)).not.toBeNull();
  });
});

describe('DailyNotesList — unplaced Daily Notes (ADR-023) — the bug this phase fixes', () => {
  it("today's draft appears here even with NO Daily Notes folder chain on disk yet (fresh-vault boot)", async () => {
    // No Daily Notes/Archive/etc. folders seeded at all — mirrors a
    // freshly-deleted vault's first boot, where Application.open()
    // resolves today's note via openAtPath with nothing on disk yet.
    const { pageOperations, vault, query, membershipSelector, workspace } = setup([], []);

    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // A synthetic, folder-less month section renders the draft — no crash,
    // no silent omission, and (per FolderTree's own new test) it no longer
    // also renders in Notes.
    expect(screen.queryByText(/August/)).not.toBeNull();
    expect(screen.getByText('Start typing...')).toBeInTheDocument();
  });

  it('an unplaced draft folds into an existing month section covering the same date, rather than rendering a duplicate header', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder('month-august', `${ROOT}/Daily Notes/2026/August`, 'year-2026');
    const persisted = makeDailyNote('daily-1', '2026-08-05', 'month-august');
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [persisted],
      [dailyNotesRoot, year, month]
    );

    // A second August date, opened via a path whose month folder happens
    // to already exist — resolveDraftTarget resolves a real folderId here,
    // so this is the "placed" case, included only to prove the "unplaced"
    // test above is exercising the genuinely different (folderId: null)
    // path, not something every openAtPath call would pass anyway.
    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.getAllByText(/August/)).toHaveLength(1);
  });

  it('an unplaced (folder-less) month section is clickable — it opens its one draft, since there is no Folder to open a collection for', async () => {
    const { pageOperations, vault, query, membershipSelector, workspace } = setup([], []);

    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    const onOpenDraft = vi.fn();
    const onOpen = vi.fn();

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={onOpen}
        onOpenDraft={onOpenDraft}
        onOpenFolder={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/August/));

    expect(onOpenDraft).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('an unplaced (folder-less) month section is collapsible, tracked via Workspace section state rather than a Folder id', async () => {
    const { pageOperations, vault, query, membershipSelector, workspace } = setup([], []);

    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });

    const { container, queryByText } = render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(queryByText('Start typing...')).not.toBeNull();

    const caret = container.querySelector('.section-header__caret') as HTMLElement;
    fireEvent.click(caret);

    expect(workspace.isSectionExpanded('unplaced:2026-08-01')).toBe(false);
  });
});

describe('DailyNotesList — draft Daily Notes appear immediately (ADR-020 rule 13 adoption)', () => {
  it('a Daily Note draft opened via openAtPath, targeting an existing month folder, appears before any save', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
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
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // The month section now exists (it did before too, since the folder
    // was pre-seeded) and renders one row for the draft. A daily-note's
    // filename is never shown as its title (getPageDisplayLabel's own
    // rule — the date is redundant next to the day badge), and it has no
    // description/body yet, so it falls all the way to the shared
    // placeholder — "the draft appeared" is what's under test, not its
    // exact label text.
    expect(screen.queryByText(/August/)).not.toBeNull();
    expect(screen.getByText('Start typing...')).toBeInTheDocument();
  });

  it('clicking a draft Daily Note invokes onOpenDraft, not onOpen', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-21.md`, {
      type: 'daily-note',
    });

    const onOpen = vi.fn();
    const onOpenDraft = vi.fn();

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={onOpen}
        onOpenDraft={onOpenDraft}
        onOpenFolder={vi.fn()}
      />
    );

    screen.getByText('Start typing...').click();

    expect(onOpenDraft).toHaveBeenCalledWith(expect.any(String));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('DailyNotesList — reusable-draft policy (PageOperations.findReusableDraftId) surfaces correctly here', () => {
  it('clicking a second date while the first is still empty shows only the new date — the old one disappears, retargeted rather than duplicated', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-09.md`, {
      type: 'daily-note',
    });
    await pageOperations.openAtPath(`${ROOT}/Daily Notes/2026/August/2026-08-15.md`, {
      type: 'daily-note',
    });

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={vi.fn()}
        onOpenDraft={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // Exactly one unsaved-daily-note row exists — same draft, retargeted.
    expect(screen.getAllByText('Start typing...')).toHaveLength(1);
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
    const { vault, query, membershipSelector, workspace } = setup(
      [today, other],
      [dailyNotesRoot, year, month]
    );

    render(
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
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
