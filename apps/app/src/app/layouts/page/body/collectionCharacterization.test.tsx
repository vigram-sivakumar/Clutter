// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { sortAssets } from '@features/collection/components/asset/sortAssets';
import type { Asset } from '@core/vault/models/Asset';
import { localAsset } from '@core/vault/testing/localAsset';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import { AssetsCollectionBody } from './AssetsCollectionBody';
import {
  CollectionBody,
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  DEFAULT_COLLECTION_SORT,
  sortCollectionEntries,
  type CollectionSortState,
  type CollectionViewMode,
} from './CollectionBody';
import { CollectionViewMenu } from './CollectionViewMenu';
import {
  ASSET_COLLECTION_VIEW_CAPABILITIES,
  NOTE_COLLECTION_VIEW_CAPABILITIES,
  resolveSupportedLayout,
  resolveSupportedSort,
  type CollectionViewCapabilities,
} from './collectionViewCapabilities';

/**
 * CHARACTERIZATION of the Collection View as it behaves TODAY, written before the property-registry
 * migration. Nothing here is a statement of what the product *should* do:
 *
 *  - Tests under "CURRENT BEHAVIOR" pin behavior the migration must preserve unless a product
 *    decision changes it.
 *  - Tests whose name starts with "KNOWN DEFECT:" pin behavior we have confirmed is wrong or
 *    inconsistent and have deliberately NOT fixed yet. When the migration fixes one, that test is
 *    expected to fail and must be rewritten to the new, intended behavior in the same commit —
 *    it is a tripwire, not a requirement.
 *
 * The existing per-component suites (CollectionViewMenu / CollectionBody / AssetsCollectionBody /
 * ArchiveCollectionBody / sortAssets tests) stay as they are; this file adds the cross-cutting
 * matrix and the gaps they leave.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

// --------------------------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------------------------

type Layout = CollectionViewMode;

function note(title: string, overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: overrides.id ?? title,
    type: 'note',
    title,
    icon: 'note',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

function folder(title: string, overrides: Partial<CollectionEntryModel> = {}): CollectionEntryModel {
  return {
    id: overrides.id ?? title,
    type: 'folder',
    title,
    icon: 'folder',
    emoji: null,
    selected: false,
    onClick: vi.fn(),
    ...overrides,
  };
}

const titles = (entries: readonly CollectionEntryModel[]) => entries.map((entry) => entry.title);

function renderMenu({
  viewMode,
  capabilities = NOTE_COLLECTION_VIEW_CAPABILITIES,
  showArchived = false,
  sort = DEFAULT_COLLECTION_SORT,
}: {
  viewMode: Layout;
  capabilities?: CollectionViewCapabilities;
  showArchived?: boolean;
  sort?: CollectionSortState;
}) {
  const onPropertiesChange = vi.fn();
  const utils = render(
    <CollectionViewMenu
      viewMode={viewMode}
      onChange={vi.fn()}
      properties={DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
      onPropertiesChange={onPropertiesChange}
      sort={sort}
      onSortChange={vi.fn()}
      capabilities={capabilities}
      showArchived={showArchived}
    />
  );
  fireEvent.click(utils.container.querySelector('[aria-haspopup="menu"]')!);
  return { ...utils, onPropertiesChange };
}

const menuLabels = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim() ?? '');

/** The root view's three sections, read straight from the open menu. */
function readRootMenu() {
  const labels = menuLabels();
  const propertiesAt = labels.indexOf('Properties');

  return {
    layouts: labels.slice(0, propertiesAt),
    hasPropertiesRow: propertiesAt !== -1,
    sort: propertiesAt === -1 ? labels : labels.slice(propertiesAt + 1),
  };
}

/** The Properties submenu's rows. Must be called with the root view open. */
function readPropertiesSubmenu(getByText: (text: string) => HTMLElement) {
  fireEvent.click(getByText('Properties'));
  return menuLabels();
}

const iso = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

function asset(name: string, facts?: { size: number; createdAt: string | null; modifiedAt: string | null }): Asset {
  return localAsset({
    id: name,
    kind: 'image',
    name,
    path: `/vault/Assets/${name}`,
    parentId: 'assets-folder',
    metadata: facts,
  });
}

const resolveResourceUrl = (path: string) => `app://vault${path.replace('/vault', '')}`;

function renderAssets(
  assets: Asset[],
  viewMode: Layout,
  properties = DEFAULT_COLLECTION_PROPERTY_VISIBILITY
) {
  return render(
    <AssetsCollectionBody
      assets={assets}
      viewMode={viewMode}
      properties={properties}
      resolveResourceUrl={resolveResourceUrl}
      onRenameResource={vi.fn()}
    />
  );
}

// --------------------------------------------------------------------------------------------
// A. CONFIGURE — Properties and Sort by, every collection × layout
// --------------------------------------------------------------------------------------------

describe('CURRENT BEHAVIOR — Configure: the Layout / Properties / Sort by lists of every collection and layout', () => {
  const NOTES = NOTE_COLLECTION_VIEW_CAPABILITIES;
  const ASSETS = ASSET_COLLECTION_VIEW_CAPABILITIES;

  /**
   * One row per collection × layout. `properties` is the Properties submenu; `sort` is the root view's
   * Sort by rows. Order matters (it is the order on screen). The Archive is the note collection with
   * `showArchived`; every other note collection (folders, Inbox, Templates, Workspace, Favorites,
   * Tags) shares the NOTES capabilities, so one "notes" row stands for all of them.
   */
  const MATRIX: ReadonlyArray<{
    name: string;
    capabilities: CollectionViewCapabilities;
    showArchived: boolean;
    viewMode: Layout;
    properties: string[];
    sort: string[];
  }> = [
    { name: 'notes', capabilities: NOTES, showArchived: false, viewMode: 'list', properties: ['Description', 'Cover image', 'Created', 'Last edited'], sort: ['Name', 'Description', 'Cover image', 'Created', 'Last edited'] },
    { name: 'notes', capabilities: NOTES, showArchived: false, viewMode: 'table', properties: ['Description', 'Cover image', 'Created', 'Last edited'], sort: ['Name', 'Description', 'Cover image', 'Created', 'Last edited'] },
    { name: 'notes', capabilities: NOTES, showArchived: false, viewMode: 'card', properties: ['Description', 'Last edited'], sort: ['Name', 'Description', 'Last edited'] },
    { name: 'archive', capabilities: NOTES, showArchived: true, viewMode: 'list', properties: ['Description', 'Created', 'Last edited', 'Archived'], sort: ['Name', 'Description', 'Created', 'Last edited', 'Archived'] },
    { name: 'archive', capabilities: NOTES, showArchived: true, viewMode: 'table', properties: ['Description', 'Created', 'Last edited', 'Archived'], sort: ['Name', 'Description', 'Created', 'Last edited', 'Archived'] },
    { name: 'archive', capabilities: NOTES, showArchived: true, viewMode: 'card', properties: ['Description', 'Last edited', 'Archived'], sort: ['Name', 'Description', 'Last edited', 'Archived'] },
    { name: 'assets', capabilities: ASSETS, showArchived: false, viewMode: 'list', properties: ['File size', 'Created', 'Last edited'], sort: ['Name', 'File size', 'Created', 'Last edited'] },
    { name: 'assets', capabilities: ASSETS, showArchived: false, viewMode: 'table', properties: ['File size', 'Created', 'Last edited'], sort: ['Name', 'File size', 'Created', 'Last edited'] },
    { name: 'assets', capabilities: ASSETS, showArchived: false, viewMode: 'card', properties: ['Title', 'File size', 'Created', 'Last edited'], sort: ['Name', 'File size', 'Created', 'Last edited'] },
  ];

  it.each(MATRIX)('$name · $viewMode: Properties and Sort by are exactly these rows, in this order', (row) => {
    const { getByText } = renderMenu({
      viewMode: row.viewMode,
      capabilities: row.capabilities,
      showArchived: row.showArchived,
    });

    const root = readRootMenu();
    expect(root.sort).toEqual(row.sort);
    expect(readPropertiesSubmenu(getByText)).toEqual(row.properties);
  });

  it('every collection offers the same three layouts in the same order — List, Table, Card (Archive included)', () => {
    for (const [capabilities, showArchived] of [
      [NOTES, false],
      [NOTES, true],
      [ASSETS, false],
    ] as const) {
      renderMenu({ viewMode: 'table', capabilities, showArchived });
      expect(readRootMenu().layouts).toEqual(['List', 'Table', 'Card']);
      cleanup();
    }
  });

  it('the first-time layout is Table for notes and Card for assets; a layout a collection does not offer falls back to that default', () => {
    expect(NOTES.defaultLayout).toBe('table');
    expect(ASSETS.defaultLayout).toBe('card');
    expect(resolveSupportedLayout(undefined, NOTES)).toBe('table');
    expect(resolveSupportedLayout(undefined, ASSETS)).toBe('card');
    expect(resolveSupportedLayout('table', { ...ASSETS, layouts: ['list', 'card'] })).toBe('card');
  });

  it('Properties is offered in every layout, Card included, for every collection', () => {
    for (const row of MATRIX) {
      renderMenu({ viewMode: row.viewMode, capabilities: row.capabilities, showArchived: row.showArchived });
      expect(readRootMenu().hasPropertiesRow, `${row.name} ${row.viewMode}`).toBe(true);
      cleanup();
    }
  });
});

describe('CURRENT BEHAVIOR — Configure: where Name appears', () => {
  it('Name is never a toggle in List or Table, for notes, the Archive or assets — the row anchor is simply always there', () => {
    for (const [capabilities, showArchived] of [
      [NOTE_COLLECTION_VIEW_CAPABILITIES, false],
      [NOTE_COLLECTION_VIEW_CAPABILITIES, true],
      [ASSET_COLLECTION_VIEW_CAPABILITIES, false],
    ] as const) {
      for (const viewMode of ['list', 'table'] as const) {
        const { getByText } = renderMenu({ viewMode, capabilities, showArchived });
        const properties = readPropertiesSubmenu(getByText);

        expect(properties, `${viewMode}`).not.toContain('Name');
        expect(properties, `${viewMode}`).not.toContain('Title');
        cleanup();
      }
    }
  });

  it('Name is not a toggle on a NOTE card either (Name is the one fixed sort row, not a property)', () => {
    const { getByText } = renderMenu({ viewMode: 'card' });

    expect(readPropertiesSubmenu(getByText)).not.toContain('Title');
  });

  it('the Asset card is the one exception: it offers "Title" — the name of the card — as the first Property', () => {
    const { getByText } = renderMenu({ viewMode: 'card', capabilities: ASSET_COLLECTION_VIEW_CAPABILITIES });

    expect(readPropertiesSubmenu(getByText)[0]).toBe('Title');
  });

  it('"Title" is never a Sort by row: sorting by name is the always-present "Name" row', () => {
    renderMenu({ viewMode: 'card', capabilities: ASSET_COLLECTION_VIEW_CAPABILITIES });

    const sort = readRootMenu().sort;
    expect(sort).toContain('Name');
    expect(sort).not.toContain('Title');
  });
});

describe('CURRENT BEHAVIOR — a required Name is enforced by absence of a control, not by the resolved state', () => {
  // Today nothing resolves or clamps the `title` property: a persisted `title: false` reaches the body
  // untouched. It is simply ignored outside the Asset card, because only that layout reads it. The new
  // architecture must enforce "Name is required" in the resolver instead (decided requirement).
  const hiddenTitle = {
    ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
    title: false,
    size: false,
    created: false,
    updated: false,
  };

  it('List and Table still draw each asset\'s name with title:false', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderAssets([asset('house.png')], viewMode, hiddenTitle);

      expect(container.textContent, viewMode).toContain('house');
      cleanup();
    }
  });

  it('the Asset card is the only layout that hides the name — it then has no title section at all', () => {
    const { container } = renderAssets([asset('house.png')], 'card', hiddenTitle);

    expect(container.querySelector('.card-title-section')).toBeNull();
  });

  it('a note card ignores `title` entirely and always draws the note\'s name', () => {
    const { container } = render(
      <CollectionBody
        notes={[note('Plan')]}
        viewMode="card"
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, title: false }}
      />
    );

    expect(container.textContent).toContain('Plan');
  });
});

describe('CURRENT BEHAVIOR — what a Properties toggle persists: a full snapshot of every key', () => {
  it('toggling one property hands back ALL eight keys (including the unrelated and the dead ones), with only that one flipped', () => {
    const { getByText, onPropertiesChange } = renderMenu({ viewMode: 'list' });

    readPropertiesSubmenu(getByText);
    fireEvent.click(getByText('Created'));

    expect(onPropertiesChange).toHaveBeenCalledTimes(1);
    const next = onPropertiesChange.mock.calls[0]![0] as Record<string, boolean>;
    expect(Object.keys(next).sort()).toEqual(
      ['archived', 'cover', 'created', 'description', 'preview', 'size', 'title', 'updated'].sort()
    );
    expect(next).toEqual({ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, created: false });
  });

  it('the first-time defaults: every key true for notes; assets additionally start with size / created / updated off', () => {
    expect(DEFAULT_COLLECTION_PROPERTY_VISIBILITY).toEqual({
      description: true,
      created: true,
      updated: true,
      archived: true,
      cover: true,
      preview: true,
      title: true,
      size: true,
    });
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.defaultProperties).toEqual({
      size: false,
      created: false,
      updated: false,
    });
  });
});

// --------------------------------------------------------------------------------------------
// B. SORTING
// --------------------------------------------------------------------------------------------

describe('CURRENT BEHAVIOR — sorting: Name', () => {
  it('orders by plain localeCompare — digits compare character by character, NOT numerically ("Project 10" before "Project 2")', () => {
    const entries = [note('Project 2'), note('Project 10'), note('Project 1')];

    expect(titles(sortCollectionEntries(entries, { key: 'name', direction: 'down' }))).toEqual([
      'Project 1',
      'Project 10',
      'Project 2',
    ]);
    expect(titles(sortCollectionEntries(entries, { key: 'name', direction: 'up' }))).toEqual([
      'Project 2',
      'Project 10',
      'Project 1',
    ]);
  });

  it('assets order the same way, by the extension-free name shown', () => {
    const sorted = sortAssets([asset('file2.png'), asset('file10.png'), asset('file1.png')], {
      key: 'name',
      direction: 'down',
    });

    expect(sorted.map((a) => a.name)).toEqual(['file1.png', 'file10.png', 'file2.png']);
  });

  it('is locale-aware rather than code-point order: "apple" sorts before "Banana" (notes and assets alike)', () => {
    expect(titles(sortCollectionEntries([note('Banana'), note('apple')], { key: 'name', direction: 'down' }))).toEqual([
      'apple',
      'Banana',
    ]);
    expect(
      sortAssets([asset('Banana.png'), asset('apple.png')], { key: 'name', direction: 'down' }).map((a) => a.name)
    ).toEqual(['apple.png', 'Banana.png']);
  });

  it('the sidebar\'s natural ordering is a different comparator: nothing in Configure sorts "2" before "10"', () => {
    const sorted = titles(sortCollectionEntries([note('Item 10'), note('Item 2')], { key: 'name', direction: 'down' }));

    expect(sorted).not.toEqual(['Item 2', 'Item 10']);
  });
});

describe('CURRENT BEHAVIOR — sorting: direction and missing values', () => {
  const old = note('Old', { createdAt: iso(1), updatedAt: iso(1), description: 'b' });
  const mid = note('Mid', { createdAt: iso(2), updatedAt: iso(2), description: 'a' });
  const fresh = note('Fresh', { createdAt: iso(3), updatedAt: iso(3) });

  it('down means A→Z for text, newest first for dates', () => {
    expect(titles(sortCollectionEntries([old, fresh, mid], { key: 'name', direction: 'down' }))).toEqual(['Fresh', 'Mid', 'Old']);
    expect(titles(sortCollectionEntries([old, fresh, mid], { key: 'created', direction: 'down' }))).toEqual(['Fresh', 'Mid', 'Old']);
    expect(titles(sortCollectionEntries([old, fresh, mid], { key: 'updated', direction: 'down' }))).toEqual(['Fresh', 'Mid', 'Old']);
  });

  it('down means largest first for file size (assets)', () => {
    const facts = (size: number) => ({ size, createdAt: null, modifiedAt: null });
    const sorted = sortAssets([asset('s.png', facts(1)), asset('l.png', facts(9)), asset('m.png', facts(5))], {
      key: 'size',
      direction: 'down',
    });

    expect(sorted.map((a) => a.name)).toEqual(['l.png', 'm.png', 's.png']);
  });

  it('down means "shows a cover" first for Cover image, and a hidden cover counts as none', () => {
    const covered = note('Covered', { cover: 'Assets/a.png' });
    const hidden = note('Hidden', { cover: 'Assets/b.png', coverHidden: true });
    const bare = note('Bare');

    expect(titles(sortCollectionEntries([bare, hidden, covered], { key: 'cover', direction: 'down' }))).toEqual([
      'Covered',
      'Bare',
      'Hidden',
    ]);
    expect(titles(sortCollectionEntries([bare, hidden, covered], { key: 'cover', direction: 'up' }))).toEqual([
      'Bare',
      'Hidden',
      'Covered',
    ]);
  });

  it('a missing value sorts last in BOTH directions: dates, descriptions, and asset facts', () => {
    for (const direction of ['down', 'up'] as const) {
      expect(titles(sortCollectionEntries([note('None'), mid], { key: 'created', direction })).at(-1)).toBe('None');
      expect(titles(sortCollectionEntries([note('None'), mid], { key: 'description', direction })).at(-1)).toBe('None');
      expect(
        sortAssets([asset('none.png'), asset('has.png', { size: 3, createdAt: iso(1), modifiedAt: iso(1) })], {
          key: 'size',
          direction,
        }).at(-1)?.name
      ).toBe('none.png');
    }
  });

  it('a whitespace-only description counts as missing', () => {
    const blank = note('Blank', { description: '   ' });

    expect(titles(sortCollectionEntries([blank, mid], { key: 'description', direction: 'down' }))).toEqual(['Mid', 'Blank']);
  });

  it('a sort by a property the item does not have leaves the order as given: size for notes, a description for assets', () => {
    expect(titles(sortCollectionEntries([note('B'), note('A')], { key: 'size', direction: 'down' }))).toEqual(['B', 'A']);
    expect(
      sortAssets([asset('b.png'), asset('a.png')], { key: 'description', direction: 'down' }).map((a) => a.name)
    ).toEqual(['b.png', 'a.png']);
  });
});

describe('CURRENT BEHAVIOR — sorting: tie-breaking (notes and assets DIFFER — a unified sorter must pick one)', () => {
  it('notes: equal dates keep the input order, in either direction (a stable sort, no name tie-break)', () => {
    const zed = note('Zed', { createdAt: iso(5) });
    const alpha = note('Alpha', { createdAt: iso(5) });

    expect(titles(sortCollectionEntries([zed, alpha], { key: 'created', direction: 'down' }))).toEqual(['Zed', 'Alpha']);
    expect(titles(sortCollectionEntries([zed, alpha], { key: 'created', direction: 'up' }))).toEqual(['Zed', 'Alpha']);
  });

  it('notes: two entries with NO date keep the input order', () => {
    expect(titles(sortCollectionEntries([note('Zed'), note('Alpha')], { key: 'updated', direction: 'down' }))).toEqual([
      'Zed',
      'Alpha',
    ]);
  });

  it('notes: equal names keep the input order', () => {
    const first = note('Same', { id: 'first' });
    const second = note('Same', { id: 'second' });

    expect(sortCollectionEntries([second, first], { key: 'name', direction: 'down' }).map((e) => e.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('notes: equal descriptions, and equal cover state, are broken by name A→Z in either direction', () => {
    const zed = note('Zed', { description: 'same' });
    const alpha = note('Alpha', { description: 'same' });
    expect(titles(sortCollectionEntries([zed, alpha], { key: 'description', direction: 'down' }))).toEqual(['Alpha', 'Zed']);
    expect(titles(sortCollectionEntries([zed, alpha], { key: 'description', direction: 'up' }))).toEqual(['Alpha', 'Zed']);

    expect(titles(sortCollectionEntries([note('Zed'), note('Alpha')], { key: 'cover', direction: 'down' }))).toEqual([
      'Alpha',
      'Zed',
    ]);
  });

  it('assets: equal facts, and assets with no fact, are broken by name A→Z in either direction', () => {
    const facts = { size: 7, createdAt: iso(5), modifiedAt: iso(5) };

    for (const key of ['size', 'created', 'updated'] as const) {
      for (const direction of ['down', 'up'] as const) {
        expect(
          sortAssets([asset('zed.png', facts), asset('alpha.png', facts)], { key, direction }).map((a) => a.name),
          `${key} ${direction}`
        ).toEqual(['alpha.png', 'zed.png']);
      }
    }
    expect(sortAssets([asset('zed.png'), asset('alpha.png')], { key: 'size', direction: 'down' }).map((a) => a.name)).toEqual([
      'alpha.png',
      'zed.png',
    ]);
  });

  it('folders have no dates or size, so a date sort leaves their order as given; a name sort still orders them', () => {
    const folders = [folder('Zed'), folder('Alpha')];

    expect(titles(sortCollectionEntries(folders, { key: 'created', direction: 'down' }))).toEqual(['Zed', 'Alpha']);
    expect(titles(sortCollectionEntries(folders, { key: 'size', direction: 'up' }))).toEqual(['Zed', 'Alpha']);
    expect(titles(sortCollectionEntries(folders, { key: 'name', direction: 'down' }))).toEqual(['Alpha', 'Zed']);
  });

  it('never mutates its input (notes and assets)', () => {
    const entries = [note('B'), note('A')];
    const assets = [asset('b.png'), asset('a.png')];

    sortCollectionEntries(entries, { key: 'name', direction: 'down' });
    sortAssets(assets, { key: 'name', direction: 'down' });

    expect(titles(entries)).toEqual(['B', 'A']);
    expect(assets.map((a) => a.name)).toEqual(['b.png', 'a.png']);
  });
});

describe('CURRENT BEHAVIOR — which persisted sort a collection honours', () => {
  const fallback = DEFAULT_COLLECTION_SORT;

  it('notes honour name, description, cover, created, updated and archived; they drop size', () => {
    for (const key of ['name', 'description', 'cover', 'created', 'updated', 'archived'] as const) {
      expect(resolveSupportedSort({ key, direction: 'up' }, NOTE_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
        key,
        direction: 'up',
      });
    }
    expect(resolveSupportedSort({ key: 'size', direction: 'up' }, NOTE_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
  });

  it('assets honour name, size, created and updated; they drop description, cover and archived', () => {
    for (const key of ['name', 'size', 'created', 'updated'] as const) {
      expect(resolveSupportedSort({ key, direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
        key,
        direction: 'up',
      });
    }
    for (const key of ['description', 'cover', 'archived'] as const) {
      expect(resolveSupportedSort({ key, direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    }
  });

  it('every collection defaults to Name, down', () => {
    expect(DEFAULT_COLLECTION_SORT).toEqual({ key: 'name', direction: 'down' });
  });
});

// --------------------------------------------------------------------------------------------
// C. LAYOUT — Archive, Note Card, label drift
// --------------------------------------------------------------------------------------------

describe('CURRENT BEHAVIOR — Archive layouts', () => {
  const renderArchive = (viewMode: Layout) =>
    render(
      <ArchiveCollectionBody
        folders={[folder('Old folder')]}
        notes={[note('Old note')]}
        viewMode={viewMode}
        resources={[]}
        onRestoreResource={vi.fn()}
        onDeleteResource={vi.fn()}
      />
    );

  it('List draws notes as rows and Table draws them as table rows; folders are always cards', () => {
    const list = renderArchive('list');
    expect(list.container.querySelectorAll('.collection-row')).toHaveLength(1);
    expect(list.container.querySelector('.collection-table')).toBeNull();
    expect(list.container.querySelectorAll('.collection-card')).toHaveLength(1);
    list.unmount();

    const table = renderArchive('table');
    expect(table.container.querySelector('.collection-table')).not.toBeNull();
    expect(table.container.querySelectorAll('.collection-card')).toHaveLength(1);
  });

  it('KNOWN DEFECT: the Archive offers Card in its layout menu but its body has no Card — it silently draws the notes as a List', () => {
    // The menu half: the Archive's capabilities are the note collection's, so Card is a choice.
    renderMenu({ viewMode: 'table', showArchived: true });
    expect(readRootMenu().layouts).toContain('Card');
    cleanup();

    // The body half: `ArchiveCollectionBody` only branches on 'table'; anything else (Card) is List.
    const { container } = renderArchive('card');
    expect(container.querySelectorAll('.collection-row')).toHaveLength(1); // the note, as a LIST ROW
    expect(container.querySelectorAll('.collection-card')).toHaveLength(1); // the folder only — no note card
  });
});

describe('KNOWN DEFECT — configure and rendering disagree about what a layout shows', () => {
  it('KNOWN DEFECT: a stale persisted sort by Created still orders a Card collection, though Configure no longer offers Created there', () => {
    const early = note('Early', { createdAt: iso(1) });
    const late = note('Late', { createdAt: iso(9) });
    const persistedBeforeSwitchingToCard: CollectionSortState = { key: 'created', direction: 'down' };

    // The resolver keeps it: Created is in the note collection's sort keys…
    expect(resolveSupportedSort(persistedBeforeSwitchingToCard, NOTE_COLLECTION_VIEW_CAPABILITIES, DEFAULT_COLLECTION_SORT)).toEqual(
      persistedBeforeSwitchingToCard
    );

    // …the Card layout's Sort by has no Created row, so nothing in the menu shows it as active…
    renderMenu({ viewMode: 'card', sort: persistedBeforeSwitchingToCard });
    expect(readRootMenu().sort).not.toContain('Created');
    cleanup();

    // …and the Card grid is nevertheless ordered by it (newest first), not by the visible Name default.
    const { container } = render(
      <CollectionBody notes={[early, late]} viewMode="card" sort={persistedBeforeSwitchingToCard} />
    );
    const order = [...container.querySelectorAll('.collection-card .card-title-section__title')].map((el) => el.textContent);
    expect(order).toEqual(['Late', 'Early']);
  });

  it('KNOWN DEFECT: a note card never shows Created (Configure hides the property there), while an asset card does', () => {
    const { container, queryByText } = render(
      <CollectionBody
        notes={[note('Plan', { created: 'Created-marker', updated: '12 Aug 2026' })]}
        viewMode="card"
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, created: true }}
      />
    );
    expect(queryByText(/Created-marker/)).not.toBeInTheDocument(); // created is on, yet not drawn
    expect(container.textContent).toContain('Edited 12 Aug 2026'); // only the edited date is
    cleanup();

    const assetCard = renderAssets(
      [asset('house.png', { size: 12_345, createdAt: iso(2), modifiedAt: iso(3) })],
      'card',
      { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, size: false, created: true, updated: false }
    );
    const labels = [...assetCard.container.querySelectorAll('.card-title-section__metadata-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Created']);
  });

  it('KNOWN DEFECT: the same property is spelled differently by Configure, the table header, the card and the note card', () => {
    // Configure: "File size", "Last edited".
    renderMenu({ viewMode: 'card', capabilities: ASSET_COLLECTION_VIEW_CAPABILITIES });
    const configure = readRootMenu().sort;
    expect(configure).toEqual(['Name', 'File size', 'Created', 'Last edited']);
    cleanup();

    const on = { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, size: true, created: true, updated: true };
    const facts = { size: 12_345, createdAt: iso(2), modifiedAt: iso(3) };

    // Asset table header: "Size", "Created", "Last edited".
    const table = renderAssets([asset('house.png', facts)], 'table', on);
    const headers = [...table.container.querySelectorAll('.collection-table__header-cell')].map((n) => n.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Size', 'Created', 'Last edited']));
    expect(headers).not.toContain('File size');
    table.unmount();

    // Asset card lines: "Size", "Created", "Edited".
    const card = renderAssets([asset('house.png', facts)], 'card', on);
    expect([...card.container.querySelectorAll('.card-title-section__metadata-label')].map((n) => n.textContent)).toEqual([
      'Size',
      'Created',
      'Edited',
    ]);
    card.unmount();

    // Note card: no label at all — "Edited <date>" as one string.
    const noteCard = render(<CollectionBody notes={[note('Plan', { updated: '12 Aug 2026' })]} viewMode="card" />);
    expect(noteCard.container.textContent).toContain('Edited 12 Aug 2026');
    expect(noteCard.container.querySelector('.card-title-section__metadata-label')).toBeNull();
  });

  it('KNOWN DEFECT: Cover image is a Property in List and Table, but a note card ignores it — the cover is always drawn', () => {
    const entry = note('Plan', { markdown: '# H', cover: 'Assets/hero.png' });
    const resolvers = { resolveCoverImage: (c: string) => `app://vault/${c}` };

    const { container } = render(
      <CollectionBody
        notes={[entry]}
        viewMode="card"
        properties={{ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, cover: false }}
        previewResolvers={resolvers}
      />
    );

    expect(container.querySelector('.note-page-canvas__cover')).toBeInTheDocument();
  });
});

describe('CURRENT BEHAVIOR — folders ignore Properties and carry counts instead', () => {
  it('a folder card never shows description or dates, in any layout', () => {
    for (const viewMode of ['list', 'table', 'card'] as const) {
      const { container } = render(
        <CollectionBody
          folders={[folder('Projects', { subfolderCount: 2, noteCount: 5 })]}
          viewMode={viewMode}
          properties={DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
        />
      );

      expect(container.textContent, viewMode).toContain('2 Subfolders');
      expect(container.textContent, viewMode).toContain('5 Notes');
      cleanup();
    }
  });
});
