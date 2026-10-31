// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import { collectionViewKeyForFolder } from '@core/application/collection/collectionViewKey';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { FOLDER_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import { pickSidebarSort, type SidebarSort } from '@core/properties/sidebarSort';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '@core/vault/models';
import { CollectionBody } from '@app/layouts/page/body/CollectionBody';
import { CollectionViewMenu } from '@app/layouts/page/body/CollectionViewMenu';
import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';

import { levelEntries, levelEntryOrderId } from './sidebarSort';
import { placeSiblingInLevel, setLevelSort, levelOrderContextFor } from './sidebarOrderActions';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const ROOT = '/vault';
const MANUAL: SidebarSort = { key: 'manual', direction: 'down' };
const BY_NAME: SidebarSort = { key: 'name', direction: 'down' };

function folder(id: string, name: string): Folder {
  return { id, name, path: `/v/${name}`, parentId: 'parent', metadata: { icon: null, favorite: false, archivedAt: null } } as unknown as Folder;
}

function page(id: string, name: string): EffectivePage {
  return { id, name, title: name, isDraft: false, createdAt: null, updatedAt: null } as unknown as EffectivePage;
}

// Banana(f), Apple(n), Cherry(n), Date(f): Name order is Apple, Banana, Cherry, Date.
const FOLDERS = [folder('fb', 'Banana'), folder('fd', 'Date')];
const PAGES = [page('na', 'Apple'), page('nc', 'Cherry')];

/** A selector that lists the same children for the parent folder, whatever else is asked. */
const selector = {
  getVisibleChildFolders: () => FOLDERS,
  getNotesChildPages: () => PAGES,
  getWorkspaceFolders: () => FOLDERS,
} as unknown as MembershipSelector;

const newStore = (fileSystem = new InMemoryVaultFileSystem()) => CollectionViewConfigStore.load(fileSystem, ROOT);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The sidebar's drawn order for a level (ids, kind-prefixed), read the way the sidebar reads it. */
function sidebarOrder(store: CollectionViewConfigStore, parentId: string): string[] {
  const stored = store.get(collectionViewKeyForFolder(parentId));
  return levelEntries(selector, parentId, stored?.sidebarSort, stored?.sidebarOrder).map(levelEntryOrderId);
}

/** The folder page's drawn order of folders then notes, read the way PageHost reads it. */
function pageTitles(store: CollectionViewConfigStore, parentId: string): string[] {
  const stored = store.get(collectionViewKeyForFolder(parentId));
  const entryOrder = levelEntries(selector, parentId, stored?.sidebarSort, stored?.sidebarOrder).map((e) =>
    e.kind === 'folder' ? e.folder.id : e.entry.id
  );
  const { container } = render(
    <CollectionBody
      folders={FOLDERS.map((f) => folderEntry({ id: f.id, title: f.name }))}
      notes={PAGES.map((p) => noteEntry({ id: p.id, title: p.name }))}
      viewMode="list"
      entryOrder={entryOrder}
    />
  );
  const titles = [...container.querySelectorAll('.collection-entry')].map((el) => el.textContent ?? '');
  cleanup();
  return titles;
}

describe('a folder has one sort, shared by its sidebar level and its collection page', () => {
  it('the sort picked through the shared rule is what both read from the one stored entry', async () => {
    const store = await newStore();

    setLevelSort(store, selector, 'parent', BY_NAME);

    expect(store.get(collectionViewKeyForFolder('parent'))?.sidebarSort).toEqual(BY_NAME);
    expect(sidebarOrder(store, 'parent')).toEqual(['n:na', 'f:fb', 'n:nc', 'f:fd']);
    // The page draws each kind in the sidebar's relative order.
    expect(pageTitles(store, 'parent').join('|')).toMatch(/Banana.*Date.*Apple.*Cherry/);
  });

  it('a manual order set from the sidebar draws the same on the page', async () => {
    const store = await newStore();
    const context = levelOrderContextFor(store, selector);

    placeSiblingInLevel(context, { kind: 'note', id: 'nc' }, 'parent', { kind: 'folder', id: 'fb' }, 'before');

    expect(sidebarOrder(store, 'parent')).toEqual(['n:na', 'n:nc', 'f:fb', 'f:fd']);
    expect(pageTitles(store, 'parent').join('|')).toMatch(/Banana.*Date.*Apple.*Cherry/);

    placeSiblingInLevel(context, { kind: 'folder', id: 'fd' }, 'parent', { kind: 'folder', id: 'fb' }, 'before');
    expect(pageTitles(store, 'parent').join('|')).toMatch(/Date.*Banana/);
  });

  it('a change written from either surface notifies the other (one store, one subscription)', async () => {
    const store = await newStore();
    const sidebar = vi.fn();
    const page = vi.fn();
    store.subscribe(sidebar);
    store.subscribe(page);

    setLevelSort(store, selector, 'parent', { key: 'name', direction: 'up' });

    expect(sidebar).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('Manual → Name → Manual brings the saved manual order back', async () => {
    const store = await newStore();
    const context = levelOrderContextFor(store, selector);
    placeSiblingInLevel(context, { kind: 'folder', id: 'fd' }, 'parent', { kind: 'note', id: 'na' }, 'before');
    const manual = sidebarOrder(store, 'parent');
    expect(manual[0]).toBe('f:fd');

    setLevelSort(store, selector, 'parent', BY_NAME);
    expect(sidebarOrder(store, 'parent')).toEqual(['n:na', 'f:fb', 'n:nc', 'f:fd']);
    expect(store.get(collectionViewKeyForFolder('parent'))?.sidebarOrder).toEqual(manual);

    setLevelSort(store, selector, 'parent', MANUAL);
    expect(sidebarOrder(store, 'parent')).toEqual(manual);
  });

  it('choosing Manual on a level with no saved order starts from what is drawn, so nothing jumps', async () => {
    const store = await newStore();
    setLevelSort(store, selector, 'parent', { key: 'name', direction: 'up' });
    const drawn = sidebarOrder(store, 'parent');

    setLevelSort(store, selector, 'parent', MANUAL);

    expect(sidebarOrder(store, 'parent')).toEqual(drawn);
  });

  it('persists across a restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await newStore(fileSystem);
    placeSiblingInLevel(levelOrderContextFor(store, selector), { kind: 'folder', id: 'fd' }, 'parent', { kind: 'note', id: 'na' }, 'before');
    await flush();

    const reloaded = await newStore(fileSystem);

    expect(reloaded.get(collectionViewKeyForFolder('parent'))).toEqual(store.get(collectionViewKeyForFolder('parent')));
    expect(sidebarOrder(reloaded, 'parent')).toEqual(sidebarOrder(store, 'parent'));
  });

  it('different folders keep different sorts', async () => {
    const store = await newStore();

    setLevelSort(store, selector, 'one', { key: 'name', direction: 'up' });
    setLevelSort(store, selector, 'two', MANUAL);

    expect(store.get(collectionViewKeyForFolder('one'))?.sidebarSort).toEqual({ key: 'name', direction: 'up' });
    expect(store.get(collectionViewKeyForFolder('two'))?.sidebarSort).toEqual(MANUAL);
    expect(store.get(collectionViewKeyForFolder('three'))).toBeUndefined();
  });

  it('sorting writes only the sort entry — it never changes the folders or notes', async () => {
    const store = await newStore();
    const before = JSON.stringify([FOLDERS, PAGES]);

    setLevelSort(store, selector, 'parent', { key: 'name', direction: 'up' });
    setLevelSort(store, selector, 'parent', MANUAL);

    expect(JSON.stringify([FOLDERS, PAGES])).toBe(before);
  });

  it('a renamed note keeps its place in a manual order (the order is by id, not by name)', async () => {
    const store = await newStore();
    placeSiblingInLevel(levelOrderContextFor(store, selector), { kind: 'note', id: 'nc' }, 'parent', { kind: 'note', id: 'na' }, 'before');
    const order = sidebarOrder(store, 'parent');

    const renamed = page('nc', 'Zebra');
    const after = levelEntries(
      { ...selector, getNotesChildPages: () => [PAGES[0], renamed] } as unknown as MembershipSelector,
      'parent',
      MANUAL,
      store.get(collectionViewKeyForFolder('parent'))?.sidebarOrder
    ).map(levelEntryOrderId);

    expect(after).toEqual(order);
  });

  it('a note moved in (not in the saved order) follows the listed ones, by name', async () => {
    const store = await newStore();
    placeSiblingInLevel(levelOrderContextFor(store, selector), { kind: 'folder', id: 'fd' }, 'parent', { kind: 'note', id: 'na' }, 'before');

    const withNewcomer = levelEntries(
      { ...selector, getNotesChildPages: () => [...PAGES, page('nz', 'Aardvark')] } as unknown as MembershipSelector,
      'parent',
      MANUAL,
      store.get(collectionViewKeyForFolder('parent'))?.sidebarOrder
    ).map(levelEntryOrderId);

    expect(withNewcomer.at(-1)).toBe('n:nz');
  });
});

describe('pickSidebarSort — the one Sort by rule', () => {
  it('re-picking the active key flips its direction; another key starts in its own default; Manual has none', () => {
    expect(pickSidebarSort(undefined, 'name')).toEqual({ key: 'name', direction: 'up' });
    expect(pickSidebarSort(BY_NAME, 'updated')).toEqual({ key: 'updated', direction: 'down' });
    expect(pickSidebarSort(BY_NAME, 'created')).toEqual({ key: 'created', direction: 'up' });
    expect(pickSidebarSort(MANUAL, 'manual')).toEqual({ key: 'manual', direction: 'down' });
  });
});

describe('the collection page menu offers the sidebar sort for a folder', () => {
  it('lists the sidebar choices (Manual included) with the active one ticked, and picking writes the shared rule', () => {
    const onChange = vi.fn();
    const onSortChange = vi.fn();
    const { container } = render(
      <CollectionViewMenu
        view={resolveCollectionView(FOLDER_COLLECTION, {})}
        onLayoutChange={vi.fn()}
        onPropertyChange={vi.fn()}
        onSortChange={onSortChange}
        levelSort={{ sort: BY_NAME, onChange }}
      />
    );
    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);

    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['Name', 'Created time', 'Last edited', 'Manual']));
    expect(labels).not.toContain('Description');

    fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === 'Manual')!);

    expect(onChange).toHaveBeenCalledWith(MANUAL);
    expect(onSortChange).not.toHaveBeenCalled();
  });
});
