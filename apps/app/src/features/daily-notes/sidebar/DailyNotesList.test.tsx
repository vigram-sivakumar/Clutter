// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesList } from './DailyNotesList';
import { useWorkspace } from '@app/hooks/useWorkspace';
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
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

// Every fixture below is anchored to the real wall-clock "today" (same
// convention DailyNotesShortcuts.test.tsx uses) rather than a hardcoded
// date, since "which month is the current month" and the virtual Today
// entry are both wall-clock-driven.
const TODAY = toISODate(new Date());
const TODAY_YEAR = TODAY.slice(0, 4);
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const TODAY_MONTH_NAME = MONTH_NAMES[new Date().getMonth()]!;

function addMonths(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1 + delta, 1);
  return toISODate(date);
}

function monthNameOf(iso: string): string {
  return MONTH_NAMES[Number(iso.slice(5, 7)) - 1]!;
}

function yearOf(iso: string): string {
  return iso.slice(0, 4);
}

// A day within `monthIso`'s month that is never TODAY itself — every
// structural fixture uses this so it never accidentally collides with the
// virtual Today entry (which is exercised by its own dedicated tests).
function dayInMonth(monthIso: string, day: number): string {
  const candidate = `${yearOf(monthIso)}-${monthIso.slice(5, 7)}-${String(day).padStart(2, '0')}`;

  return candidate === TODAY ? dayInMonth(monthIso, day === 28 ? 1 : day + 1) : candidate;
}

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

function makeMonthFolder(id: string, monthIso: string, parentId: string): Folder {
  return makeFolder(
    id,
    `${ROOT}/Daily Notes/${yearOf(monthIso)}/${monthNameOf(monthIso)}`,
    parentId
  );
}

function makeDailyNote(id: string, name: string, parentId: string): Page {
  return {
    id,
    type: 'daily-note',
    name,
    path: `${ROOT}/Daily Notes/${yearOf(name)}/${monthNameOf(name)}/${name}.md`,
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
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);

  return { vault, query, workspace, pageOperations, membershipSelector };
}

// Sidebar.tsx subscribes to Workspace via useWorkspace before passing it
// down (that subscription is what makes a workspace.notify() — e.g. from
// toggleSectionExpanded — actually re-render the tree); this wrapper
// mirrors that so DOM assertions after a caret click behave like the real
// app instead of reading a stale render.
function DailyNotesListHarness(
  props: Parameters<typeof DailyNotesList>[0]
) {
  const workspace = useWorkspace(props.workspace);

  return <DailyNotesList {...props} workspace={workspace} />;
}

function renderList(
  props: Partial<Parameters<typeof DailyNotesList>[0]> &
    Pick<Parameters<typeof DailyNotesList>[0], 'vault' | 'query' | 'membershipSelector' | 'workspace'>
) {
  return render(
    <DailyNotesListHarness onOpen={vi.fn()} onOpenDraft={vi.fn()} onOpenDate={vi.fn()} {...props} />
  );
}

// "All Daily Notes" is collapsed by default (Workspace seeds it that way) —
// tests that need to look inside it expand it via its caret first, the
// only way a user can.
function expandAllDailyNotes() {
  const header = screen.getByText('All Daily Notes').closest('.section-header') as HTMLElement;
  const caret = header.querySelector('.section-header__caret') as HTMLElement;
  fireEvent.click(caret);
}

describe('DailyNotesList — empty month sections', () => {
  it('does not render a month section with no Daily Notes in it', () => {
    const pastMonthIso = addMonths(TODAY, -3);
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${yearOf(pastMonthIso)}`, 'root');
    // A month folder with zero Daily Notes inside — the empty-section case.
    const emptyMonth = makeMonthFolder('month-empty', pastMonthIso, 'year');
    const { vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, emptyMonth]
    );

    renderList({ vault, query, membershipSelector, workspace });

    // Nothing else is populated (besides the virtual Today entry, in the
    // current month) — "All Daily Notes" has nothing to hold, so it
    // doesn't render at all.
    expect(screen.queryByText(monthNameOf(pastMonthIso), { exact: false })).toBeNull();
    expect(screen.queryByText('All Daily Notes')).toBeNull();
  });

  it('renders the current month\'s Daily Notes with no month heading', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const note = makeDailyNote('daily-1', dayInMonth(TODAY, 15), 'month');
    const { vault, query, membershipSelector, workspace } = setup(
      [note],
      [dailyNotesRoot, year, month]
    );

    renderList({ vault, query, membershipSelector, workspace });

    // The calendar above the list already identifies the current month —
    // no heading renders for it. Two rows: the persisted note and the
    // virtual Today entry (no real page/draft exists for today here).
    expect(screen.queryByText(TODAY_MONTH_NAME, { exact: false })).toBeNull();
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });
});

describe('DailyNotesList — a Note nested inside a valid month folder is not rendered as a Daily Note', () => {
  it('a persisted type: "note" page sitting alongside a real Daily Note in the same month folder is excluded from the section, while the real Daily Note still renders', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const dailyNoteDate = dayInMonth(TODAY, 12);
    const dailyNote = makeDailyNote('daily-1', dailyNoteDate, 'month');
    // Same folder, same shape, but type: 'note' — e.g. an external file
    // dropped next to a real Daily Note (PageBuilder/Vault classify it as
    // 'note' since its filename isn't the canonical Daily Note date).
    const strayNote: Page = {
      ...dailyNote,
      id: 'note-1',
      type: 'note',
      name: 'Test file',
      path: `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/Test file.md`,
    };
    const { vault, query, membershipSelector, workspace } = setup(
      [dailyNote, strayNote],
      [dailyNotesRoot, year, month]
    );

    renderList({ vault, query, membershipSelector, workspace });

    // getDailyNoteChildPages filters strictly by page.type === 'daily-note'
    // — the stray Note is excluded here regardless of sharing the same
    // month folder as a real Daily Note. Two rows render: the real Daily
    // Note plus the virtual Today entry.
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
    expect(screen.queryByText('Test file')).not.toBeInTheDocument();
  });
});

describe('DailyNotesList — malformed month folders do not crash discovery', () => {
  it('a year folder whose child folder name is not a recognized month is skipped, not thrown', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    // "08" instead of a recognized month name.
    const malformedMonth = makeFolder('month-08', `${ROOT}/Daily Notes/${TODAY_YEAR}/08`, 'year');
    const { vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, malformedMonth]
    );

    expect(() => renderList({ vault, query, membershipSelector, workspace })).not.toThrow();
  });

  it('a malformed month folder containing a Markdown file is skipped, and a valid sibling month still renders', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const malformedMonth = makeFolder('month-08', `${ROOT}/Daily Notes/${TODAY_YEAR}/08`, 'year');
    const validMonth = makeMonthFolder('month-valid', TODAY, 'year');
    // A file inside the malformed folder — its path is not the canonical
    // Daily Note path either (folder name isn't a real month name), so
    // classification already makes it a plain Note; parentId points at the
    // malformed folder, which the month-section walk must still not throw
    // on when enumerating.
    const noteDate = dayInMonth(TODAY, 12);
    const noteInMalformedFolder: Page = {
      id: 'note-in-malformed',
      type: 'note',
      name: noteDate,
      path: `${ROOT}/Daily Notes/${TODAY_YEAR}/08/${noteDate}.md`,
      parentId: 'month-08',
      metadata: defaultPageMetadata,
      source: { markdown: '' },
      analysis: defaultAnalysis,
    };
    const validNote = makeDailyNote('daily-1', dayInMonth(TODAY, 15), 'month-valid');
    const { vault, query, membershipSelector, workspace } = setup(
      [noteInMalformedFolder, validNote],
      [dailyNotesRoot, year, malformedMonth, validMonth]
    );

    expect(() => renderList({ vault, query, membershipSelector, workspace })).not.toThrow();

    // The valid month's Daily Note still renders normally, alongside the
    // virtual Today entry.
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });
});

describe('DailyNotesList — unplaced Daily Notes (ADR-023)', () => {
  it("today's draft appears here even with NO Daily Notes folder chain on disk yet (fresh-vault boot)", async () => {
    // No Daily Notes/Archive/etc. folders seeded at all — mirrors a
    // freshly-deleted vault's first boot, where Application.open()
    // resolves today's note via openAtPath with nothing on disk yet.
    const { pageOperations, vault, query, membershipSelector, workspace } = setup([], []);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${dayInMonth(TODAY, 20)}.md`,
      { type: 'daily-note' }
    );

    renderList({ vault, query, membershipSelector, workspace });

    // A folder-less draft in the current month renders directly (no
    // heading), alongside the virtual Today entry (this draft isn't dated
    // today).
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });

  it('an unplaced draft folds into an existing month section covering the same date, rather than rendering a duplicate header', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const persisted = makeDailyNote('daily-1', dayInMonth(TODAY, 5), 'month');
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [persisted],
      [dailyNotesRoot, year, month]
    );

    // A second same-month date, opened via a path whose month folder
    // happens to already exist — resolveDraftTarget resolves a real
    // folderId here, so this is the "placed" case, included only to prove
    // the "unplaced" test above is exercising the genuinely different
    // (folderId: null) path, not something every openAtPath call would
    // pass anyway.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${dayInMonth(TODAY, 20)}.md`,
      { type: 'daily-note' }
    );

    renderList({ vault, query, membershipSelector, workspace });

    // No heading, no duplicate rendering — the persisted note, the draft,
    // and the virtual Today entry all render as three plain rows.
    expect(screen.queryByText(TODAY_MONTH_NAME, { exact: false })).toBeNull();
    expect(screen.getAllByText('Start typing...')).toHaveLength(3);
  });

  it('an unplaced (folder-less) past month renders inside "All Daily Notes" with a plain, non-interactive heading', async () => {
    const { pageOperations, vault, query, membershipSelector, workspace } = setup([], []);

    const pastMonthIso = addMonths(TODAY, -1);
    const pastDate = dayInMonth(pastMonthIso, 20);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${yearOf(pastMonthIso)}/${monthNameOf(pastMonthIso)}/${pastDate}.md`,
      { type: 'daily-note' }
    );

    const onOpenDraft = vi.fn();
    const onOpen = vi.fn();

    renderList({ vault, query, membershipSelector, workspace, onOpen, onOpenDraft });

    expandAllDailyNotes();

    const pastHeader = screen
      .getByText(monthNameOf(pastMonthIso), { exact: false })
      .closest('.section-header') as HTMLElement;

    // No collapse caret, and the header itself isn't an interactive row —
    // per-month collapse/click-to-open was removed; only "All Daily Notes"
    // itself is collapsible.
    expect(pastHeader.querySelector('.section-header__caret')).toBeNull();
    expect(pastHeader.closest('.entry-interactive')).toBeNull();

    fireEvent.click(pastHeader);

    expect(onOpenDraft).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('DailyNotesList — draft Daily Notes appear immediately (ADR-020 rule 13 adoption)', () => {
  it('a Daily Note draft opened via openAtPath, targeting an existing month folder, appears before any save', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${dayInMonth(TODAY, 20)}.md`,
      { type: 'daily-note' }
    );

    renderList({ vault, query, membershipSelector, workspace });

    // The draft renders, alongside the virtual Today entry. A daily-note's
    // filename is never shown as its title (getPageDisplayLabel's own
    // rule), and it has no description/body yet, so both fall to the
    // shared placeholder.
    expect(screen.getAllByText('Start typing...')).toHaveLength(2);
  });

  it('clicking a draft Daily Note invokes onOpenDraft, not onOpen', async () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    const draftDate = dayInMonth(TODAY, 21);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${draftDate}.md`,
      { type: 'daily-note' }
    );

    const onOpen = vi.fn();
    const onOpenDraft = vi.fn();

    renderList({ vault, query, membershipSelector, workspace, onOpen, onOpenDraft });

    // Two placeholder rows exist (the draft + the virtual Today entry);
    // click by date label to target the draft exactly.
    const day = Number(draftDate.slice(8, 10));
    fireEvent.click(screen.getByText(String(day)));

    expect(onOpenDraft).toHaveBeenCalledWith(expect.any(String));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('DailyNotesList — each Daily Note date keeps its own stable draft (PageOperations.openAtPath)', () => {
  it('clicking a second date while the first is still empty shows both dates — neither is retargeted or dropped', async () => {
    // Superseded deliberately: openAtPath() no longer retargets a
    // still-empty draft across dates (see PageOperations.reusableDrafts
    // .test.ts) — each date a live draft references stays visible on its
    // own, since it may also be a live navigation-history destination
    // (Workspace.isReferencedInHistory()).
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const { pageOperations, vault, query, membershipSelector, workspace } = setup(
      [],
      [dailyNotesRoot, year, month]
    );

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${dayInMonth(TODAY, 9)}.md`,
      { type: 'daily-note' }
    );
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${dayInMonth(TODAY, 15)}.md`,
      { type: 'daily-note' }
    );

    renderList({ vault, query, membershipSelector, workspace });

    // Both dates' drafts, plus the virtual Today entry — three rows.
    expect(screen.getAllByText('Start typing...')).toHaveLength(3);
  });
});

describe('DailyNotesList — current month vs. All Daily Notes (no partitioning logic)', () => {
  it('the current month renders with no heading, directly under the calendar', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const note = makeDailyNote('daily-1', dayInMonth(TODAY, 15), 'month');
    const { vault, query, membershipSelector, workspace } = setup(
      [note],
      [dailyNotesRoot, year, month]
    );

    renderList({ vault, query, membershipSelector, workspace });

    expect(screen.queryByText(TODAY_MONTH_NAME, { exact: false })).toBeNull();
  });

  it('orders rows within the current month oldest to newest, top to bottom', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const month = makeMonthFolder('month', TODAY, 'year');
    const early = makeDailyNote('daily-early', dayInMonth(TODAY, 2), 'month');
    const late = makeDailyNote('daily-late', dayInMonth(TODAY, 27), 'month');
    const { vault, query, membershipSelector, workspace } = setup(
      [early, late],
      [dailyNotesRoot, year, month]
    );

    const { container } = renderList({ vault, query, membershipSelector, workspace });

    const dayNumbers = Array.from(container.querySelectorAll('.date-label__date')).map(
      (el) => el.textContent
    );

    expect(dayNumbers).toEqual([2, 27].sort((a, b) => a - b).map((n) => String(n)));
  });

  it('groups every other month under "All Daily Notes", oldest to newest, once expanded', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);

    const pastMonthIso = addMonths(TODAY, -1);
    const futureMonthIso = addMonths(TODAY, 1);

    const pastYear = makeFolder('year-past', `${ROOT}/Daily Notes/${yearOf(pastMonthIso)}`, 'root');
    const currentYear = makeFolder('year-current', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const futureYear = makeFolder(
      'year-future',
      `${ROOT}/Daily Notes/${yearOf(futureMonthIso)}`,
      'root'
    );

    const pastMonth = makeMonthFolder('month-past', pastMonthIso, 'year-past');
    const currentMonth = makeMonthFolder('month-current', TODAY, 'year-current');
    const futureMonth = makeMonthFolder('month-future', futureMonthIso, 'year-future');

    const pastNote = makeDailyNote('daily-past', dayInMonth(pastMonthIso, 28), 'month-past');
    const currentNote = makeDailyNote('daily-current', dayInMonth(TODAY, 15), 'month-current');
    const futureNote = makeDailyNote('daily-future', dayInMonth(futureMonthIso, 2), 'month-future');

    const { vault, query, membershipSelector, workspace } = setup(
      [pastNote, currentNote, futureNote],
      [dailyNotesRoot, pastYear, currentYear, futureYear, pastMonth, currentMonth, futureMonth]
    );

    const { container } = renderList({ vault, query, membershipSelector, workspace });

    // Only the current month's rows are visible initially; the other two
    // months are inside the collapsed "All Daily Notes".
    expect(screen.queryByText(monthNameOf(pastMonthIso), { exact: false })).toBeNull();
    expect(screen.queryByText(monthNameOf(futureMonthIso), { exact: false })).toBeNull();
    expect(screen.getByText('All Daily Notes')).toBeInTheDocument();

    expandAllDailyNotes();

    const headerTitles = Array.from(container.querySelectorAll('.section-header')).map(
      (el) => el.textContent
    );

    // "All Daily Notes" itself, then its two month sub-headings, oldest to
    // newest — no current/future/past partitioning.
    expect(headerTitles).toEqual([
      'All Daily Notes',
      expect.stringContaining(monthNameOf(pastMonthIso)),
      expect.stringContaining(monthNameOf(futureMonthIso)),
    ]);
  });

  it("a month in a different year than today carries its own year in the heading — no separate, standalone year heading", () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const pastYearMonthIso = addMonths(TODAY, -14); // guaranteed a different calendar year
    const pastYear = makeFolder(
      'year-past',
      `${ROOT}/Daily Notes/${yearOf(pastYearMonthIso)}`,
      'root'
    );
    const currentYear = makeFolder('year-current', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const currentMonth = makeMonthFolder('month-current', TODAY, 'year-current');
    const pastYearMonth = makeMonthFolder('month-past-year', pastYearMonthIso, 'year-past');

    const currentNote = makeDailyNote('daily-current', dayInMonth(TODAY, 15), 'month-current');
    const pastYearNote = makeDailyNote(
      'daily-past-year',
      dayInMonth(pastYearMonthIso, 10),
      'month-past-year'
    );

    const { vault, query, membershipSelector, workspace } = setup(
      [currentNote, pastYearNote],
      [dailyNotesRoot, pastYear, currentYear, currentMonth, pastYearMonth]
    );

    renderList({ vault, query, membershipSelector, workspace });
    expandAllDailyNotes();

    expect(screen.queryByText(yearOf(pastYearMonthIso), { exact: true })).toBeNull();
    expect(screen.getByText(new RegExp(yearOf(pastYearMonthIso)))).toBeInTheDocument();
  });
});

describe('DailyNotesList — virtual Today entry (Today is always represented)', () => {
  it('renders a placeholder-styled row for today when no real page or draft exists for it yet', () => {
    const { vault, query, membershipSelector, workspace } = setup([], []);

    renderList({ vault, query, membershipSelector, workspace });

    expect(screen.getByText('Start typing...')).toBeInTheDocument();
  });

  it('does not duplicate today when a real draft for today already exists', async () => {
    const { pageOperations, vault, query, membershipSelector, workspace } = setup([], []);

    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/${TODAY_YEAR}/${TODAY_MONTH_NAME}/${TODAY}.md`,
      { type: 'daily-note' }
    );

    renderList({ vault, query, membershipSelector, workspace });

    expect(screen.getAllByText('Start typing...')).toHaveLength(1);
  });

  it("clicking the virtual Today row calls onOpenDate with today's date, not onOpen/onOpenDraft", () => {
    const { vault, query, membershipSelector, workspace } = setup([], []);

    const onOpen = vi.fn();
    const onOpenDraft = vi.fn();
    const onOpenDate = vi.fn();

    renderList({ vault, query, membershipSelector, workspace, onOpen, onOpenDraft, onOpenDate });

    fireEvent.click(screen.getByText('Start typing...'));

    expect(onOpenDate).toHaveBeenCalledWith(TODAY);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it('the virtual Today row has no overflow menu', () => {
    const { vault, query, membershipSelector, workspace } = setup([], []);

    const rowActions = {
      openMenuId: null,
      onOpenMenu: vi.fn(),
      onCloseMenu: vi.fn(),
      onArchiveNote: vi.fn(),
      onDeleteNote: vi.fn(),
    };

    const { container } = renderList({ vault, query, membershipSelector, workspace, rowActions });

    expect(container.querySelector('[data-testid*="overflow"]')).toBeNull();
  });
});

describe('DailyNotesList — "All Daily Notes" collapsed state (session-scoped via Workspace)', () => {
  function setupWithPastMonth() {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const currentYear = makeFolder('year-current', `${ROOT}/Daily Notes/${TODAY_YEAR}`, 'root');
    const currentMonth = makeMonthFolder('month-current', TODAY, 'year-current');
    const currentNote = makeDailyNote('daily-current', dayInMonth(TODAY, 15), 'month-current');

    const pastMonthIso = addMonths(TODAY, -1);
    const pastYearId = yearOf(pastMonthIso) === TODAY_YEAR ? 'year-current' : 'year-past';
    const pastYear = makeFolder('year-past', `${ROOT}/Daily Notes/${yearOf(pastMonthIso)}`, 'root');
    const pastMonth = makeMonthFolder('month-past', pastMonthIso, pastYearId);
    const pastNote = makeDailyNote('daily-past', dayInMonth(pastMonthIso, 10), 'month-past');

    const folders = [dailyNotesRoot, currentYear, currentMonth, pastMonth];
    if (pastYearId === 'year-past') {
      folders.push(pastYear);
    }

    return { ...setup([currentNote, pastNote], folders), pastMonthIso };
  }

  it('starts collapsed on first render — only the current month is visible', () => {
    const { vault, query, membershipSelector, workspace, pastMonthIso } = setupWithPastMonth();

    renderList({ vault, query, membershipSelector, workspace });

    expect(screen.getByText('All Daily Notes')).toBeInTheDocument();
    expect(screen.queryByText(monthNameOf(pastMonthIso), { exact: false })).toBeNull();
  });

  it('expanding reveals the grouped months', () => {
    const { vault, query, membershipSelector, workspace, pastMonthIso } = setupWithPastMonth();

    renderList({ vault, query, membershipSelector, workspace });
    expandAllDailyNotes();

    expect(screen.getByText(monthNameOf(pastMonthIso), { exact: false })).toBeInTheDocument();
  });

  it('stays expanded across a remount that reuses the same Workspace (e.g. switching sidebar tabs and back)', () => {
    const { vault, query, membershipSelector, workspace, pastMonthIso } = setupWithPastMonth();

    const { unmount } = renderList({ vault, query, membershipSelector, workspace });
    expandAllDailyNotes();
    expect(screen.getByText(monthNameOf(pastMonthIso), { exact: false })).toBeInTheDocument();

    // Simulate a sidebar tab switch: DailyNotesList unmounts entirely
    // (Sidebar.tsx renders only the active tab's panel), then remounts
    // with the same, still-live Workspace instance.
    unmount();
    renderList({ vault, query, membershipSelector, workspace });

    expect(screen.getByText(monthNameOf(pastMonthIso), { exact: false })).toBeInTheDocument();
  });

  it('resets to collapsed only when a new Workspace is constructed (app restart)', () => {
    const { vault, query, membershipSelector, workspace, pastMonthIso } = setupWithPastMonth();

    const { unmount } = renderList({ vault, query, membershipSelector, workspace });
    expandAllDailyNotes();
    expect(screen.getByText(monthNameOf(pastMonthIso), { exact: false })).toBeInTheDocument();
    unmount();

    // A fresh Workspace — same as Application constructing `new Workspace()`
    // at boot — has no memory of the prior session's expand action.
    const freshWorkspace = new Workspace();
    renderList({ vault, query, membershipSelector, workspace: freshWorkspace });

    expect(screen.queryByText(monthNameOf(pastMonthIso), { exact: false })).toBeNull();
  });
});
