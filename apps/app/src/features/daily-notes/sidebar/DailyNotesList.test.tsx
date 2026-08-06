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

function makeDailyNote(
  id: string,
  name: string,
  parentId: string,
  monthName = 'August'
): Page {
  return {
    id,
    type: 'daily-note',
    name,
    path: `${ROOT}/Daily Notes/2026/${monthName}/${name}.md`,
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
    new SaveCoordinator(),
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

    // August is the current month here (see makeDailyNote/currentDate), so
    // its heading is intentionally hidden (see the "current month heading"
    // describe block below) — assert the section still renders its content
    // instead.
    expect(screen.getByText('Start typing...')).toBeInTheDocument();
  });
});

describe('DailyNotesList — unplaced Daily Notes (ADR-023) — the bug this phase fixes', () => {
  it("today's draft appears here even with NO Daily Notes folder chain on disk yet (fresh-vault boot)", async () => {
    // No Daily Notes/Archive/etc. folders seeded at all — mirrors a
    // freshly-deleted vault's first boot, where Application.open()
    // resolves today's note via openAtPath with nothing on disk yet.
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([], []);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-20.md`,
      {
        type: 'daily-note',
      }
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

    // A synthetic, folder-less month section renders the draft — no crash,
    // no silent omission, and (per FolderTree's own new test) it no longer
    // also renders in Notes. August is the current month here, so its
    // heading is intentionally absent — the row itself is what's under test.
    expect(screen.getByText('Start typing...')).toBeInTheDocument();
  });

  it('an unplaced draft folds into an existing month section covering the same date, rather than rendering a duplicate header', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const persisted = makeDailyNote('daily-1', '2026-08-05', 'month-august');
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([persisted], [dailyNotesRoot, year, month]);

    // A second August date, opened via a path whose month folder happens
    // to already exist — resolveDraftTarget resolves a real folderId here,
    // so this is the "placed" case, included only to prove the "unplaced"
    // test above is exercising the genuinely different (folderId: null)
    // path, not something every openAtPath call would pass anyway.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-20.md`,
      {
        type: 'daily-note',
      }
    );

    const { container } = render(
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

    // August is the current month, so its heading is hidden regardless of
    // fold behavior — assert the fold itself structurally instead: exactly
    // one section rendered (not two, one per date), holding both rows.
    expect(container.querySelectorAll('.section')).toHaveLength(1);
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });

  it('an unplaced (folder-less) month section is clickable — it opens its one draft, since there is no Folder to open a collection for', async () => {
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([], []);

    // July, not August — August is the current month here, and its header
    // (carrying this click-to-open handler) is intentionally hidden by the
    // current-month heading rule. A past month keeps its normal, clickable
    // header, which is what this test is actually about.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/July/2026-07-20.md`,
      {
        type: 'daily-note',
      }
    );

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

    fireEvent.click(screen.getByText(/July/));

    expect(onOpenDraft).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('an unplaced (folder-less) month section is collapsible, tracked via Workspace section state rather than a Folder id', async () => {
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([], []);

    // Same reasoning as the clickable test above — use a past month so the
    // header (and its collapse caret) actually renders.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/July/2026-07-20.md`,
      {
        type: 'daily-note',
      }
    );

    const { queryByText } = render(
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

    const julyHeader = screen.getByText(/July/).closest('.section-header') as HTMLElement;
    const caret = julyHeader.querySelector('.section-header__caret') as HTMLElement;
    fireEvent.click(caret);

    expect(workspace.isSectionExpanded('unplaced:2026-07-01')).toBe(false);
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
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([], [dailyNotesRoot, year, month]);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-20.md`,
      {
        type: 'daily-note',
      }
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

    // The month section now exists (it did before too, since the folder
    // was pre-seeded) and renders one row for the draft. A daily-note's
    // filename is never shown as its title (getPageDisplayLabel's own
    // rule — the date is redundant next to the day badge), and it has no
    // description/body yet, so it falls all the way to the shared
    // placeholder — "the draft appeared" is what's under test, not its
    // exact label text. (August is the current month, so its own heading
    // is intentionally hidden — see the dedicated describe block below.)
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
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([], [dailyNotesRoot, year, month]);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-21.md`,
      {
        type: 'daily-note',
      }
    );

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
    const { pageOperations, vault, query, membershipSelector, workspace } =
      setup([], [dailyNotesRoot, year, month]);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-09.md`,
      {
        type: 'daily-note',
      }
    );
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`,
      {
        type: 'daily-note',
      }
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

    // No dedicated "Today" heading — and no month heading either, since
    // August is the current month here (hidden per the current-month
    // heading rule); both notes render once each, purely as members of
    // that one section.
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText(/August/)).toBeNull();
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });
});

describe('DailyNotesList — current month heading is hidden and pinned to the top', () => {
  it('hides only the current month\'s heading — a past month alongside it still gets one', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const august = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const july = makeFolder(
      'month-july',
      `${ROOT}/Daily Notes/2026/July`,
      'year-2026'
    );
    const currentMonthNote = makeDailyNote('daily-aug', '2026-08-15', 'month-august');
    const pastMonthNote = makeDailyNote(
      'daily-jul',
      '2026-07-31',
      'month-july',
      'July'
    );
    const { vault, query, membershipSelector, workspace } = setup(
      [currentMonthNote, pastMonthNote],
      [dailyNotesRoot, year, august, july]
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

    expect(screen.queryByText(/August/)).toBeNull();
    expect(screen.queryByText(/July/)).not.toBeNull();
  });

  it('pins the current month first even when a future Daily Note would otherwise sort above it', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const august = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const september = makeFolder(
      'month-september',
      `${ROOT}/Daily Notes/2026/September`,
      'year-2026'
    );
    const currentMonthNote = makeDailyNote('daily-aug', '2026-08-15', 'month-august');
    const futureMonthNote = makeDailyNote(
      'daily-sep',
      '2026-09-01',
      'month-september',
      'September'
    );
    const { vault, query, membershipSelector, workspace } = setup(
      [currentMonthNote, futureMonthNote],
      [dailyNotesRoot, year, august, september]
    );

    const { container } = render(
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

    // The plain chronological sort (sortRenderedSections alone) would put
    // September first — splitting the current month out and rendering it
    // directly under the calendar must override that.
    expect(screen.queryByText(/August/)).toBeNull();
    expect(screen.queryByText(/September/)).not.toBeNull();

    const dayNumbers = Array.from(
      container.querySelectorAll('.date-label__date')
    ).map((el) => el.textContent);

    expect(dayNumbers).toEqual(['15', '1']);
  });

  it('orders current, future, then past — matching the product mockup', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const august = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const september = makeFolder(
      'month-september',
      `${ROOT}/Daily Notes/2026/September`,
      'year-2026'
    );
    const july = makeFolder(
      'month-july',
      `${ROOT}/Daily Notes/2026/July`,
      'year-2026'
    );
    const currentMonthNote = makeDailyNote('daily-aug', '2026-08-15', 'month-august');
    const futureMonthNote = makeDailyNote(
      'daily-sep',
      '2026-09-01',
      'month-september',
      'September'
    );
    const pastMonthNote = makeDailyNote(
      'daily-jul',
      '2026-07-31',
      'month-july',
      'July'
    );
    const { vault, query, membershipSelector, workspace } = setup(
      [currentMonthNote, futureMonthNote, pastMonthNote],
      [dailyNotesRoot, year, august, september, july]
    );

    const { container } = render(
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

    // Only August (the current month) has no heading — September (future)
    // and July (past) both keep theirs, in their original relative order.
    expect(screen.queryByText(/August/)).toBeNull();

    const headerTitles = Array.from(
      container.querySelectorAll('.section-header')
    ).map((el) => el.textContent);
    expect(headerTitles[0]).toMatch(/September/);
    expect(headerTitles[1]).toMatch(/July/);

    const dayNumbers = Array.from(
      container.querySelectorAll('.date-label__date')
    ).map((el) => el.textContent);
    expect(dayNumbers).toEqual(['15', '1', '31']);
  });

  it('a past year\'s months carry the year right in their own heading — no separate, standalone year heading', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year2026 = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const august = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const july2026 = makeFolder(
      'month-july-2026',
      `${ROOT}/Daily Notes/2026/July`,
      'year-2026'
    );
    const year2025 = makeFolder('year-2025', `${ROOT}/Daily Notes/2025`, 'root');
    const november2025 = makeFolder(
      'month-november-2025',
      `${ROOT}/Daily Notes/2025/November`,
      'year-2025'
    );
    const july2025 = makeFolder(
      'month-july-2025',
      `${ROOT}/Daily Notes/2025/July`,
      'year-2025'
    );

    const currentMonthNote = makeDailyNote('daily-aug', '2026-08-15', 'month-august');
    const currentYearPastMonthNote = makeDailyNote(
      'daily-jul-2026',
      '2026-07-31',
      'month-july-2026',
      'July'
    );
    const november2025Note = {
      ...makeDailyNote('daily-nov-2025', '2025-11-30', 'month-november-2025', 'November'),
      path: `${ROOT}/Daily Notes/2025/November/2025-11-30.md`,
    };
    const july2025Note = {
      ...makeDailyNote('daily-jul-2025', '2025-07-15', 'month-july-2025', 'July'),
      path: `${ROOT}/Daily Notes/2025/July/2025-07-15.md`,
    };

    const { vault, query, membershipSelector, workspace } = setup(
      [currentMonthNote, currentYearPastMonthNote, november2025Note, july2025Note],
      [
        dailyNotesRoot,
        year2026,
        august,
        july2026,
        year2025,
        november2025,
        july2025,
      ]
    );

    const { container } = render(
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

    // No standalone "2025" (or "2026") heading anywhere — 2026 is the
    // current year, so its month needs no year at all; 2025's months carry
    // "2025" as part of their own heading text instead of a separate row.
    expect(screen.queryByText('2026', { exact: true })).toBeNull();
    expect(screen.queryByText('2025', { exact: true })).toBeNull();

    const headerTitles = Array.from(
      container.querySelectorAll('.section-header')
    ).map((el) => el.textContent);
    expect(headerTitles).toEqual(['July', 'Nov 2025', 'Jul 2025']);
  });

  it('keeps the current year together, directly after the current month, even when a future year exists — not a single global date sort', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year2026 = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const august = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const july2026 = makeFolder(
      'month-july-2026',
      `${ROOT}/Daily Notes/2026/July`,
      'year-2026'
    );
    const year2027 = makeFolder('year-2027', `${ROOT}/Daily Notes/2027`, 'root');
    const march2027 = makeFolder(
      'month-march-2027',
      `${ROOT}/Daily Notes/2027/March`,
      'year-2027'
    );
    const year2025 = makeFolder('year-2025', `${ROOT}/Daily Notes/2025`, 'root');
    const november2025 = makeFolder(
      'month-november-2025',
      `${ROOT}/Daily Notes/2025/November`,
      'year-2025'
    );

    const currentMonthNote = makeDailyNote('daily-aug', '2026-08-15', 'month-august');
    const currentYearPastMonthNote = makeDailyNote(
      'daily-jul-2026',
      '2026-07-31',
      'month-july-2026',
      'July'
    );
    const march2027Note = {
      ...makeDailyNote('daily-mar-2027', '2027-03-10', 'month-march-2027', 'March'),
      path: `${ROOT}/Daily Notes/2027/March/2027-03-10.md`,
    };
    const november2025Note = {
      ...makeDailyNote('daily-nov-2025', '2025-11-30', 'month-november-2025', 'November'),
      path: `${ROOT}/Daily Notes/2025/November/2025-11-30.md`,
    };

    const { vault, query, membershipSelector, workspace } = setup(
      [currentMonthNote, currentYearPastMonthNote, march2027Note, november2025Note],
      [
        dailyNotesRoot,
        year2026,
        august,
        july2026,
        year2027,
        march2027,
        year2025,
        november2025,
      ]
    );

    const { container } = render(
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

    // A plain global descending date sort would put March 2027 (a later
    // date) above July (2026, the current year's remaining month) — the
    // current year must stay together right after the current month
    // regardless of any later year existing.
    const headerTitles = Array.from(
      container.querySelectorAll('.section-header')
    ).map((el) => el.textContent);
    expect(headerTitles).toEqual(['July', 'Mar 2027', 'Nov 2025']);

    const dayNumbers = Array.from(
      container.querySelectorAll('.date-label__date')
    ).map((el) => el.textContent);
    expect(dayNumbers).toEqual(['15', '31', '10', '30']);
  });
});
