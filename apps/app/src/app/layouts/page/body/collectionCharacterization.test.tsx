// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { ASSET_SORT_OPTIONS, toAssetEntry } from '@features/collection/components/asset/toAssetEntry';
import { formatEntryTimestamp } from '@features/collection/properties/formatProperty';
import { folderEntry, noteEntry, type EntryFixture } from '@features/collection/testing/collectionEntry';
import { sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import type { PropertyId } from '@core/properties/collectionProperties';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import {
  ARCHIVE_COLLECTION,
  ASSETS_COLLECTION,
  FOLDER_COLLECTION,
  type CollectionDefinition,
} from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import { noteVisible } from '@features/collection/testing/visibleProperties';
import type { Asset } from '@core/vault/models/Asset';
import { localAsset } from '@core/vault/testing/localAsset';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import { AssetsCollectionBody } from './AssetsCollectionBody';
import { CollectionBody, NOTE_SORT_OPTIONS } from './CollectionBody';
import { CollectionViewMenu } from './CollectionViewMenu';

/**
 * CHARACTERIZATION of the Collection View, written before the property-registry migration and
 * migrated WITH it. Nothing here is a statement of what the product should do:
 *
 *  - Tests under "CURRENT BEHAVIOR" pin behavior that holds today. Where the migration changed
 *    behavior ON PURPOSE the test says so ("— changed by the registry migration"); every other
 *    expectation is exactly what was pinned before it.
 *  - Tests whose name starts with "KNOWN DEFECT:" pin behavior we have confirmed is wrong or
 *    inconsistent and have deliberately NOT fixed. When one is fixed, that test is expected to
 *    fail and must be rewritten to the new, intended behavior in the same commit — it is a
 *    tripwire, not a requirement.
 *
 * Deliberate changes made by the migration (each is a product decision recorded in the
 * architecture proposal): Name is a locked, ticked row in Configure → Properties wherever the
 * layout requires it; Configure offers the SAME properties in every layout (so a note Card now
 * offers Created and Cover image, which the card does not draw — the known gaps below); the
 * asset Card's "Title" toggle is the Name row; the stale-hidden-sort defect is gone because Sort by
 * no longer varies with the layout.
 *
 * The per-component suites (CollectionViewMenu / CollectionBody / AssetsCollectionBody /
 * ArchiveCollectionBody / toAssetEntry tests) cover each unit; this file adds the cross-cutting
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

type Layout = CollectionLayout;

const note = (title: string, fixture: EntryFixture = {}): CollectionEntryModel => noteEntry({ id: title, title, ...fixture });
const folder = (title: string, fixture: EntryFixture = {}): CollectionEntryModel => folderEntry({ id: title, title, ...fixture });

/** The two collections' sorters: the one engine, with the tie-breaks each has always had. */
const sortCollectionEntries = (entries: readonly CollectionEntryModel[], sort: CollectionSort) =>
  sortEntries(entries, sort, NOTE_SORT_OPTIONS);
const sortAssets = (assets: readonly Asset[], sort: CollectionSort): Asset[] =>
  sortEntries(assets.map((asset) => toAssetEntry(asset)), sort, ASSET_SORT_OPTIONS).map((entry) => entry.asset);

const titles = (entries: readonly CollectionEntryModel[]) => entries.map((entry) => entry.values.name);

function renderMenu({
  viewMode,
  definition = FOLDER_COLLECTION,
  sort,
}: {
  viewMode: Layout;
  definition?: CollectionDefinition;
  sort?: CollectionSort;
}) {
  const onPropertyChange = vi.fn();
  const utils = render(
    <CollectionViewMenu
      view={resolveCollectionView(definition, { layout: viewMode, sort })}
      onLayoutChange={vi.fn()}
      onPropertyChange={onPropertyChange}
      onSortChange={vi.fn()}
    />
  );
  fireEvent.click(utils.container.querySelector('[aria-haspopup="menu"]')!);
  return { ...utils, onPropertyChange };
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

// Dates are ISO instants (the raw property value); the text a layout shows is the formatter's.
const CREATED_AT = '2026-08-10T09:03:00.000Z';
const UPDATED_AT = '2026-08-12T14:20:00.000Z';
const CREATED_TEXT = formatEntryTimestamp(CREATED_AT)!;
const UPDATED_TEXT = formatEntryTimestamp(UPDATED_AT)!;

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

// Every property an asset collection offers, visible (what the file-fact tests turn on).
const ASSET_FACTS_ON: PropertyId[] = ['name', 'size', 'created', 'updated'];

const resolveResourceUrl = (path: string) => `app://vault${path.replace('/vault', '')}`;

function renderAssets(assets: Asset[], viewMode: Layout, visible: readonly PropertyId[] = ASSET_FACTS_ON) {
  return render(
    <AssetsCollectionBody
      assets={assets}
      viewMode={viewMode}
      visible={visible}
      resolveResourceUrl={resolveResourceUrl}
      onRenameResource={vi.fn()}
    />
  );
}

// --------------------------------------------------------------------------------------------
// A. CONFIGURE — Properties and Sort by, every collection × layout
// --------------------------------------------------------------------------------------------

describe('CURRENT BEHAVIOR — Configure: the Layout / Properties / Sort by lists of every collection and layout', () => {
  const NOTES = FOLDER_COLLECTION;
  const ASSETS = ASSETS_COLLECTION;
  const NOTE_ROWS = ['Name', 'Description', 'Cover image', 'Created', 'Last edited'];
  const ARCHIVE_ROWS = ['Name', 'Delete'];
  const ASSET_ROWS = ['Name', 'File size', 'Created', 'Last edited'];

  /**
   * One row per collection × layout. `properties` is the Properties submenu; `sort` is the root view's
   * Sort by rows. Order matters (it is the registry's order). Every note-shaped collection (folders, Inbox,
   * Templates, Workspace, Favorites, Tags) shares the NOTES definition's selection, so one "notes" row stands
   * for all of them. Changed by the registry migration: the lists are the SAME in every layout (Name is in
   * Properties, locked where the layout requires it) — before, Card dropped Created and Cover image and
   * List/Table hid Name.
   */
  const MATRIX: ReadonlyArray<{
    name: string;
    definition: CollectionDefinition;
    viewMode: Layout;
    properties: string[];
    sort: string[];
  }> = [
    { name: 'notes', definition: NOTES, viewMode: 'list', properties: NOTE_ROWS, sort: NOTE_ROWS },
    { name: 'notes', definition: NOTES, viewMode: 'table', properties: NOTE_ROWS, sort: NOTE_ROWS },
    { name: 'notes', definition: NOTES, viewMode: 'card', properties: NOTE_ROWS, sort: NOTE_ROWS },
    { name: 'archive', definition: ARCHIVE_COLLECTION, viewMode: 'list', properties: ARCHIVE_ROWS, sort: ARCHIVE_ROWS },
    { name: 'archive', definition: ARCHIVE_COLLECTION, viewMode: 'table', properties: ARCHIVE_ROWS, sort: ARCHIVE_ROWS },
    { name: 'assets', definition: ASSETS, viewMode: 'list', properties: ASSET_ROWS, sort: ASSET_ROWS },
    { name: 'assets', definition: ASSETS, viewMode: 'table', properties: ASSET_ROWS, sort: ASSET_ROWS },
    { name: 'assets', definition: ASSETS, viewMode: 'card', properties: ASSET_ROWS, sort: ASSET_ROWS },
  ];

  it.each(MATRIX)('$name · $viewMode: Properties and Sort by are exactly these rows, in this order', (row) => {
    const { getByText } = renderMenu({ viewMode: row.viewMode, definition: row.definition });

    const root = readRootMenu();
    expect(root.sort).toEqual(row.sort);
    expect(readPropertiesSubmenu(getByText)).toEqual(row.properties);
  });

  it('every collection offers List, Table and Card in that order — except the Archive, which has no Card', () => {
    for (const definition of [NOTES, ARCHIVE_COLLECTION, ASSETS]) {
      renderMenu({ viewMode: 'table', definition });
      expect(readRootMenu().layouts).toEqual(definition === ARCHIVE_COLLECTION ? ['List', 'Table'] : ['List', 'Table', 'Card']);
      cleanup();
    }
  });

  it('the first-time layout is Table for notes and Card for assets; a layout a collection does not offer falls back to that default', () => {
    expect(resolveCollectionView(NOTES).layout).toBe('table');
    expect(resolveCollectionView(ASSETS).layout).toBe('card');
    expect(resolveCollectionView({ ...ASSETS, layouts: ['list', 'card'] }, { layout: 'table' }).layout).toBe('card');
  });

  it('Properties is offered in every layout, Card included, for every collection', () => {
    for (const row of MATRIX) {
      renderMenu({ viewMode: row.viewMode, definition: row.definition });
      expect(readRootMenu().hasPropertiesRow, `${row.name} ${row.viewMode}`).toBe(true);
      cleanup();
    }
  });
});

describe('CURRENT BEHAVIOR — Configure: where Name appears (changed by the registry migration: a locked, ticked row)', () => {
  const nameRow = (getByText: (text: string) => HTMLElement) => getByText('Name').closest('[role="menuitem"]')!;

  it('Name is the first Properties row in List, Table AND Card, ticked and locked — for notes, the Archive and assets (Table/List)', () => {
    for (const [definition, layouts] of [
      [FOLDER_COLLECTION, ['list', 'table', 'card']],
      [ARCHIVE_COLLECTION, ['list', 'table', 'card']],
      [ASSETS_COLLECTION, ['list', 'table']],
    ] as const) {
      for (const viewMode of layouts) {
        const { getByText } = renderMenu({ viewMode, definition });
        const properties = readPropertiesSubmenu(getByText);

        expect(properties[0], `${definition.kind} ${viewMode}`).toBe('Name');
        expect(nameRow(getByText).querySelector('.entry__leading svg')).toBeInTheDocument();
        expect(nameRow(getByText)).toHaveAttribute('aria-disabled', 'true');
        cleanup();
      }
    }
  });

  it('the Asset card is the one exception: Name is a normal toggle there (it was "Title")', () => {
    const { getByText } = renderMenu({ viewMode: 'card', definition: ASSETS_COLLECTION });

    expect(readPropertiesSubmenu(getByText)[0]).toBe('Name');
    expect(nameRow(getByText)).not.toHaveAttribute('aria-disabled');
    expect(menuLabels()).not.toContain('Title');
  });

  it('Name is also the always-present Sort by row', () => {
    renderMenu({ viewMode: 'card', definition: ASSETS_COLLECTION });

    expect(readRootMenu().sort).toContain('Name');
  });
});

describe('CURRENT BEHAVIOR — a required Name is enforced by the RESOLVER, whatever is persisted (changed by the registry migration)', () => {
  // Before: a persisted `title: false` reached the body untouched and was merely ignored outside the Asset
  // card — enforced by the absence of a control. Now the resolved view itself never hides a required property.
  const hiddenName = { name: false };

  it('a persisted `name: false` cannot hide the name in List or Table, for assets or notes', () => {
    for (const definition of [ASSETS_COLLECTION, FOLDER_COLLECTION]) {
      for (const layout of ['list', 'table'] as const) {
        const view = resolveCollectionView(definition, { layout, propertyOverrides: hiddenName });

        expect(view.visible, `${definition.kind} ${layout}`).toContain('name');
        expect(view.locked, `${definition.kind} ${layout}`).toEqual(['name']);
      }
    }
  });

  it('a note card cannot hide it either — Name is required in every note layout', () => {
    const view = resolveCollectionView(FOLDER_COLLECTION, { layout: 'card', propertyOverrides: hiddenName });
    expect(view.visible).toContain('name');

    const { container } = render(<CollectionBody notes={[note('Plan')]} viewMode="card" visible={view.visible} />);
    expect(container.textContent).toContain('Plan');
  });

  it('the Asset card is the only layout where a hidden name is honoured — it then has no title section at all', () => {
    const view = resolveCollectionView(ASSETS_COLLECTION, { layout: 'card', propertyOverrides: hiddenName });
    expect(view.visible).not.toContain('name');

    const { container } = renderAssets([asset('house.png')], 'card', view.visible);
    expect(container.querySelector('.card-title-section')).toBeNull();
  });

  it('List and Table still draw each asset\'s name', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { container } = renderAssets([asset('house.png')], viewMode, resolveCollectionView(ASSETS_COLLECTION, { layout: viewMode, propertyOverrides: hiddenName }).visible);

      expect(container.textContent, viewMode).toContain('house');
      cleanup();
    }
  });
});

describe('CURRENT BEHAVIOR — what a Properties toggle reports and persists (changed: intent only, no full snapshot)', () => {
  it('toggling one property reports that ONE property and its new visibility — nothing else, no defaults', () => {
    const { getByText, onPropertyChange } = renderMenu({ viewMode: 'list' });

    readPropertiesSubmenu(getByText);
    fireEvent.click(getByText('Created'));

    expect(onPropertyChange).toHaveBeenCalledTimes(1);
    expect(onPropertyChange).toHaveBeenCalledWith('created', false);
  });

  it('the first-time defaults: notes show name, description, cover, created, last edited; the Archive name and delete date; assets only the name', () => {
    expect(resolveCollectionView(FOLDER_COLLECTION).visible).toEqual(['name', 'description', 'cover', 'created', 'updated']);
    expect(resolveCollectionView(ARCHIVE_COLLECTION).visible).toEqual(['name', 'archived']);
    expect(resolveCollectionView(ASSETS_COLLECTION).visible).toEqual(['name']);
  });
});

// --------------------------------------------------------------------------------------------
// B. SORTING
// --------------------------------------------------------------------------------------------

describe('CURRENT BEHAVIOR — sorting: Name', () => {
  it('orders by plain localeCompare — digits compare character by character, NOT numerically ("Project 10" before "Project 2")', () => {
    const entries = [note('Project 2'), note('Project 10'), note('Project 1')];

    expect(titles(sortCollectionEntries(entries, { property: 'name', direction: 'down' }))).toEqual([
      'Project 1',
      'Project 10',
      'Project 2',
    ]);
    expect(titles(sortCollectionEntries(entries, { property: 'name', direction: 'up' }))).toEqual([
      'Project 2',
      'Project 10',
      'Project 1',
    ]);
  });

  it('assets order the same way, by the extension-free name shown', () => {
    const sorted = sortAssets([asset('file2.png'), asset('file10.png'), asset('file1.png')], {
      property: 'name',
      direction: 'down',
    });

    expect(sorted.map((a) => a.name)).toEqual(['file1.png', 'file10.png', 'file2.png']);
  });

  it('is locale-aware rather than code-point order: "apple" sorts before "Banana" (notes and assets alike)', () => {
    expect(titles(sortCollectionEntries([note('Banana'), note('apple')], { property: 'name', direction: 'down' }))).toEqual([
      'apple',
      'Banana',
    ]);
    expect(
      sortAssets([asset('Banana.png'), asset('apple.png')], { property: 'name', direction: 'down' }).map((a) => a.name)
    ).toEqual(['apple.png', 'Banana.png']);
  });

  it('the sidebar\'s natural ordering is a different comparator: nothing in Configure sorts "2" before "10"', () => {
    const sorted = titles(sortCollectionEntries([note('Item 10'), note('Item 2')], { property: 'name', direction: 'down' }));

    expect(sorted).not.toEqual(['Item 2', 'Item 10']);
  });
});

describe('CURRENT BEHAVIOR — sorting: direction and missing values', () => {
  const old = note('Old', { created: iso(1), updated: iso(1), description: 'b' });
  const mid = note('Mid', { created: iso(2), updated: iso(2), description: 'a' });
  const fresh = note('Fresh', { created: iso(3), updated: iso(3) });

  it('down means A→Z for text, newest first for dates', () => {
    expect(titles(sortCollectionEntries([old, fresh, mid], { property: 'name', direction: 'down' }))).toEqual(['Fresh', 'Mid', 'Old']);
    expect(titles(sortCollectionEntries([old, fresh, mid], { property: 'created', direction: 'down' }))).toEqual(['Fresh', 'Mid', 'Old']);
    expect(titles(sortCollectionEntries([old, fresh, mid], { property: 'updated', direction: 'down' }))).toEqual(['Fresh', 'Mid', 'Old']);
  });

  it('down means largest first for file size (assets)', () => {
    const facts = (size: number) => ({ size, createdAt: null, modifiedAt: null });
    const sorted = sortAssets([asset('s.png', facts(1)), asset('l.png', facts(9)), asset('m.png', facts(5))], {
      property: 'size',
      direction: 'down',
    });

    expect(sorted.map((a) => a.name)).toEqual(['l.png', 'm.png', 's.png']);
  });

  it('down means "shows a cover" first for Cover image, and a hidden cover counts as none', () => {
    const covered = note('Covered', { cover: 'Assets/a.png' });
    // A hidden cover is no cover value — the adapter drops it, so it counts as none when sorting.
    const hidden = note('Hidden');
    const bare = note('Bare');

    expect(titles(sortCollectionEntries([bare, hidden, covered], { property: 'cover', direction: 'down' }))).toEqual([
      'Covered',
      'Bare',
      'Hidden',
    ]);
    expect(titles(sortCollectionEntries([bare, hidden, covered], { property: 'cover', direction: 'up' }))).toEqual([
      'Bare',
      'Hidden',
      'Covered',
    ]);
  });

  it('a missing value sorts last in BOTH directions: dates, descriptions, and asset facts', () => {
    for (const direction of ['down', 'up'] as const) {
      expect(titles(sortCollectionEntries([note('None'), mid], { property: 'created', direction })).at(-1)).toBe('None');
      expect(titles(sortCollectionEntries([note('None'), mid], { property: 'description', direction })).at(-1)).toBe('None');
      expect(
        sortAssets([asset('none.png'), asset('has.png', { size: 3, createdAt: iso(1), modifiedAt: iso(1) })], {
          property: 'size',
          direction,
        }).at(-1)?.name
      ).toBe('none.png');
    }
  });

  it('a whitespace-only description counts as missing', () => {
    const blank = note('Blank', { description: '   ' });

    expect(titles(sortCollectionEntries([blank, mid], { property: 'description', direction: 'down' }))).toEqual(['Mid', 'Blank']);
  });

  it('a sort by a property the item does not have leaves the order as given: size for notes, a description for assets', () => {
    expect(titles(sortCollectionEntries([note('B'), note('A')], { property: 'size', direction: 'down' }))).toEqual(['B', 'A']);
    expect(
      sortAssets([asset('b.png'), asset('a.png')], { property: 'description', direction: 'down' }).map((a) => a.name)
    ).toEqual(['b.png', 'a.png']);
  });
});

describe('CURRENT BEHAVIOR — sorting: tie-breaking (notes and assets DIFFER — a unified sorter must pick one)', () => {
  it('notes: equal dates keep the input order, in either direction (a stable sort, no name tie-break)', () => {
    const zed = note('Zed', { created: iso(5) });
    const alpha = note('Alpha', { created: iso(5) });

    expect(titles(sortCollectionEntries([zed, alpha], { property: 'created', direction: 'down' }))).toEqual(['Zed', 'Alpha']);
    expect(titles(sortCollectionEntries([zed, alpha], { property: 'created', direction: 'up' }))).toEqual(['Zed', 'Alpha']);
  });

  it('notes: two entries with NO date keep the input order', () => {
    expect(titles(sortCollectionEntries([note('Zed'), note('Alpha')], { property: 'updated', direction: 'down' }))).toEqual([
      'Zed',
      'Alpha',
    ]);
  });

  it('notes: equal names keep the input order', () => {
    const first = note('Same', { id: 'first' });
    const second = note('Same', { id: 'second' });

    expect(sortCollectionEntries([second, first], { property: 'name', direction: 'down' }).map((e) => e.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('notes: equal descriptions, and equal cover state, are broken by name A→Z in either direction', () => {
    const zed = note('Zed', { description: 'same' });
    const alpha = note('Alpha', { description: 'same' });
    expect(titles(sortCollectionEntries([zed, alpha], { property: 'description', direction: 'down' }))).toEqual(['Alpha', 'Zed']);
    expect(titles(sortCollectionEntries([zed, alpha], { property: 'description', direction: 'up' }))).toEqual(['Alpha', 'Zed']);

    expect(titles(sortCollectionEntries([note('Zed'), note('Alpha')], { property: 'cover', direction: 'down' }))).toEqual([
      'Alpha',
      'Zed',
    ]);
  });

  it('assets: equal facts, and assets with no fact, are broken by name A→Z in either direction', () => {
    const facts = { size: 7, createdAt: iso(5), modifiedAt: iso(5) };

    for (const key of ['size', 'created', 'updated'] as const) {
      for (const direction of ['down', 'up'] as const) {
        expect(
          sortAssets([asset('zed.png', facts), asset('alpha.png', facts)], { property: key, direction }).map((a) => a.name),
          `${key} ${direction}`
        ).toEqual(['alpha.png', 'zed.png']);
      }
    }
    expect(sortAssets([asset('zed.png'), asset('alpha.png')], { property: 'size', direction: 'down' }).map((a) => a.name)).toEqual([
      'alpha.png',
      'zed.png',
    ]);
  });

  it('folders have no dates or size, so a date sort leaves their order as given; a name sort still orders them', () => {
    const folders = [folder('Zed'), folder('Alpha')];

    expect(titles(sortCollectionEntries(folders, { property: 'created', direction: 'down' }))).toEqual(['Zed', 'Alpha']);
    expect(titles(sortCollectionEntries(folders, { property: 'size', direction: 'up' }))).toEqual(['Zed', 'Alpha']);
    expect(titles(sortCollectionEntries(folders, { property: 'name', direction: 'down' }))).toEqual(['Alpha', 'Zed']);
  });

  it('never mutates its input (notes and assets)', () => {
    const entries = [note('B'), note('A')];
    const assets = [asset('b.png'), asset('a.png')];

    sortCollectionEntries(entries, { property: 'name', direction: 'down' });
    sortAssets(assets, { property: 'name', direction: 'down' });

    expect(titles(entries)).toEqual(['B', 'A']);
    expect(assets.map((a) => a.name)).toEqual(['b.png', 'a.png']);
  });
});

describe('CURRENT BEHAVIOR — which persisted sort a collection honours', () => {
  const resolved = (definition: CollectionDefinition, property: PropertyId) =>
    resolveCollectionView(definition, { sort: { property, direction: 'up' } }).sort;

  it('notes honour name, description, cover, created, updated and archived; they drop size', () => {
    // (`archived` is not one a note collection OFFERS — only the Archive does — so it falls back too.)
    for (const property of ['name', 'description', 'cover', 'created', 'updated'] as const) {
      expect(resolved(FOLDER_COLLECTION, property)).toEqual({ property, direction: 'up' });
    }
    expect(resolved(FOLDER_COLLECTION, 'size')).toEqual(FOLDER_COLLECTION.defaultSort);
    expect(resolved(ARCHIVE_COLLECTION, 'archived')).toEqual({ property: 'archived', direction: 'up' });
  });

  it('assets honour name, size, created and updated; they drop description, cover and archived', () => {
    for (const property of ['name', 'size', 'created', 'updated'] as const) {
      expect(resolved(ASSETS_COLLECTION, property)).toEqual({ property, direction: 'up' });
    }
    for (const property of ['description', 'cover', 'archived'] as const) {
      expect(resolved(ASSETS_COLLECTION, property)).toEqual(ASSETS_COLLECTION.defaultSort);
    }
  });

  it('every collection defaults to Name, down', () => {
    expect(FOLDER_COLLECTION.defaultSort).toEqual({ property: 'name', direction: 'down' });
    expect(ASSETS_COLLECTION.defaultSort).toEqual({ property: 'name', direction: 'down' });
  });
});

// --------------------------------------------------------------------------------------------
// C. LAYOUT — Archive, Note Card, label drift
// --------------------------------------------------------------------------------------------

describe('CURRENT BEHAVIOR — Archive layouts (changed by the Archive migration: List and Table only, one unified list)', () => {
  const renderArchive = (viewMode: Layout) =>
    render(
      <ArchiveCollectionBody
        folders={[folder('Old folder')]}
        notes={[note('Old note')]}
        viewMode={viewMode}
        resources={[]}
      />
    );

  it('List and Table draw folders AND notes as rows of the one generic layout — folders are no longer a card grid', () => {
    const list = renderArchive('list');
    expect(list.container.querySelectorAll('.collection-list .collection-row')).toHaveLength(2);
    expect(list.container.querySelector('.collection-table')).toBeNull();
    expect(list.container.querySelector('.collection-card')).toBeNull();
    list.unmount();

    const table = renderArchive('table');
    expect(table.container.querySelectorAll('.collection-table-row')).toHaveLength(2);
    expect(table.container.querySelector('.collection-card')).toBeNull();
  });

  it('FIXED BY THE ARCHIVE MIGRATION: the Archive no longer offers Card, so it can no longer silently draw a list for it', () => {
    renderMenu({ viewMode: 'table', definition: ARCHIVE_COLLECTION });
    expect(readRootMenu().layouts).toEqual(['List', 'Table']);
    cleanup();

    // A saved Card layout resolves to the Archive's default (Table).
    expect(resolveCollectionView(ARCHIVE_COLLECTION, { layout: 'card' }).layout).toBe('table');
  });
});

describe('KNOWN DEFECT — configure and rendering disagree about what a layout shows', () => {
  it('FIXED BY THE REGISTRY MIGRATION: a persisted sort by Created is offered, and shown as active, in the Card layout too', () => {
    // Before, the Card layout's Sort by had no Created row, so a sort saved in List/Table kept ordering the Card
    // grid with nothing in the menu showing it as active. Sort by is now the same list in every layout.
    const early = note('Early', { created: iso(1) });
    const late = note('Late', { created: iso(9) });
    const persisted: CollectionSort = { property: 'created', direction: 'down' };

    renderMenu({ viewMode: 'card', sort: persisted });
    expect(readRootMenu().sort).toContain('Created');
    cleanup();

    const view = resolveCollectionView(FOLDER_COLLECTION, { layout: 'card', sort: persisted });
    expect(view.sort).toEqual(persisted);

    const { container } = render(
      <CollectionBody notes={[early, late]} viewMode="card" visible={view.visible} sort={view.sort} />
    );
    const order = [...container.querySelectorAll('.collection-card .card-title-section__title')].map((el) => el.textContent);
    expect(order).toEqual(['Late', 'Early']);
  });

  it('KNOWN DEFECT: Configure offers Created on a note Card (the same list in every layout) but the note card never draws it, while an asset card does', () => {
    const configure = renderMenu({ viewMode: 'card' });
    expect(readPropertiesSubmenu(configure.getByText)).toContain('Created');
    cleanup();

    const { container, queryByText } = render(
      <CollectionBody
        notes={[note('Plan', { created: CREATED_AT, updated: UPDATED_AT })]}
        viewMode="card"
        visible={noteVisible()}
      />
    );
    expect(queryByText(CREATED_TEXT)).not.toBeInTheDocument(); // created is on, yet not drawn
    expect(container.textContent).toContain(`Edited ${UPDATED_TEXT}`); // only the edited date is
    cleanup();

    const assetCard = renderAssets(
      [asset('house.png', { size: 12_345, createdAt: iso(2), modifiedAt: iso(3) })],
      'card',
      ['name', 'created']
    );
    const labels = [...assetCard.container.querySelectorAll('.card-title-section__metadata-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Created']);
  });

  it('KNOWN DEFECT: the same property is spelled differently by Configure, the table header, the card and the note card', () => {
    // Configure: "File size", "Last edited".
    renderMenu({ viewMode: 'card', definition: ASSETS_COLLECTION });
    const configure = readRootMenu().sort;
    expect(configure).toEqual(['Name', 'File size', 'Created', 'Last edited']);
    cleanup();

    const on = ASSET_FACTS_ON;
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
    const noteCard = render(<CollectionBody notes={[note('Plan', { updated: UPDATED_AT })]} viewMode="card" />);
    expect(noteCard.container.textContent).toContain(`Edited ${UPDATED_TEXT}`);
    expect(noteCard.container.querySelector('.card-title-section__metadata-label')).toBeNull();
  });

  it('KNOWN DEFECT: Cover image is a Property in every layout Configure offers it in (now Card too), but a note card ignores it — the cover is always drawn', () => {
    const entry = note('Plan', { markdown: '# H', cover: 'Assets/hero.png' });
    const resolvers = { resolveCoverImage: (c: string) => `app://vault/${c}` };

    const { container } = render(
      <CollectionBody
        notes={[entry]}
        viewMode="card"
        visible={noteVisible('cover')}
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
          visible={noteVisible()}
        />
      );

      expect(container.textContent, viewMode).toContain('2 Subfolders');
      expect(container.textContent, viewMode).toContain('5 Notes');
      cleanup();
    }
  });
});
