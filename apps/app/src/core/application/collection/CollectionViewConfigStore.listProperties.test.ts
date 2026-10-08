import { describe, expect, it, vi } from 'vitest';

import { CollectionViewConfigStore } from './CollectionViewConfigStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import {
  ARCHIVE_COLLECTION,
  FOLDER_COLLECTION,
  TASKS_COLLECTION,
} from '../../presentation/collection/collectionDefinitions';
import {
  propertyOverridesFor,
  propertyOverridesPatch,
  resolveCollectionView,
  setPropertyVisibility,
  toCollectionViewConfig,
} from '../../presentation/collection/resolveCollectionView';
import type { CollectionLayout } from '../../properties/collectionViewConfig';
import type { PropertyId } from '../../properties/collectionProperties';

/**
 * The List and the Table each keep their own visible properties (same registry, separate choices).
 * The List starts as the Title only — a layout default that is never written — and a List the user has
 * customized comes back unchanged after a trip through the Table.
 */

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;
const KEY = 'folder:f1';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const newStore = () => CollectionViewConfigStore.load(new InMemoryVaultFileSystem(), ROOT);

async function loadWith(collectionViewConfig: Record<string, unknown>): Promise<CollectionViewConfigStore> {
  const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: JSON.stringify({ collectionViewConfig }) });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = await CollectionViewConfigStore.load(fileSystem, ROOT);
  warn.mockRestore();
  return store;
}

/** What the page does for one toggle: resolve the layout's overrides, apply the toggle, store the patch. */
function toggle(store: CollectionViewConfigStore, layout: CollectionLayout, id: PropertyId, visible: boolean) {
  const config = toCollectionViewConfig(FOLDER_COLLECTION, store.get(KEY));
  store.update(
    KEY,
    propertyOverridesPatch(
      layout,
      setPropertyVisibility(FOLDER_COLLECTION, layout, propertyOverridesFor(FOLDER_COLLECTION, config, layout), id, visible),
      config
    )
  );
}

const visibleIn = (store: CollectionViewConfigStore, layout: CollectionLayout) =>
  resolveCollectionView(FOLDER_COLLECTION, { ...toCollectionViewConfig(FOLDER_COLLECTION, store.get(KEY)), layout }).visible;

const TABLE_DEFAULT = ['name', 'description', 'cover', 'created', 'updated'];

describe('the List view\'s own visible properties', () => {
  it('1. a List with no saved configuration shows only the Title', () => {
    expect(resolveCollectionView(FOLDER_COLLECTION, { layout: 'list' }).visible).toEqual(['name']);
    expect(resolveCollectionView(ARCHIVE_COLLECTION, { layout: 'list' }).visible).toEqual(['name']);
  });

  it('2. switching to the List does not copy the Table\'s properties', () => {
    // The Table has been customized (Cover hidden); the List has nothing saved.
    const config = { layout: 'list' as const, propertyOverrides: { cover: false } };

    expect(resolveCollectionView(FOLDER_COLLECTION, config).visible).toEqual(['name']);
    expect(resolveCollectionView(FOLDER_COLLECTION, { ...config, layout: 'table' }).visible).toEqual([
      'name',
      'description',
      'created',
      'updated',
    ]);
  });

  it('switching to the List writes only the layout — the List default is never persisted', async () => {
    const store = await newStore();

    store.update(KEY, { layout: 'list' });

    expect(store.get(KEY)).toEqual({ layout: 'list' });
  });

  it('3. customizing the List persists the List\'s own overrides, and they are what the List shows', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);
    store.update(KEY, { layout: 'list' });

    toggle(store, 'list', 'cover', true);
    toggle(store, 'list', 'created', true);

    expect(store.get(KEY)?.listPropertyOverrides).toEqual({ cover: true, created: true });
    expect(store.get(KEY)?.propertyOverrides).toBeUndefined();
    expect(visibleIn(store, 'list')).toEqual(['name', 'cover', 'created']);

    // And it survives an app restart.
    await flush();
    const reloaded = await CollectionViewConfigStore.load(fileSystem, ROOT);
    expect(reloaded.get(KEY)).toEqual({ layout: 'list', listPropertyOverrides: { cover: true, created: true } });
  });

  it('4. List → Table → List restores the List the user configured', async () => {
    const store = await newStore();
    toggle(store, 'list', 'cover', true);
    toggle(store, 'list', 'created', true);

    store.update(KEY, { layout: 'table' });
    expect(visibleIn(store, 'table')).toEqual(TABLE_DEFAULT);

    store.update(KEY, { layout: 'list' });
    expect(visibleIn(store, 'list')).toEqual(['name', 'cover', 'created']);
  });

  it('5. customizing the List leaves the Table\'s configuration exactly as it was', async () => {
    const store = await newStore();
    toggle(store, 'table', 'description', false);
    const tableBefore = store.get(KEY)?.propertyOverrides;

    toggle(store, 'list', 'cover', true);
    toggle(store, 'list', 'updated', true);

    expect(store.get(KEY)?.propertyOverrides).toEqual(tableBefore);
    expect(visibleIn(store, 'table')).toEqual(['name', 'cover', 'created', 'updated']);

    // …and the reverse: customizing the Table does not move the List.
    toggle(store, 'table', 'cover', false);
    expect(visibleIn(store, 'list')).toEqual(['name', 'cover', 'updated']);
  });

  it('the Title can never be hidden in the List', async () => {
    const store = await newStore();

    toggle(store, 'list', 'name', false);

    expect(store.get(KEY)).toBeUndefined();
    expect(visibleIn(store, 'list')).toContain('name');
  });
});

describe('existing collection configurations still load', () => {
  it('an entry with only the shared `propertyOverrides` loads unchanged and still drives the Table', async () => {
    const store = await loadWith({ [KEY]: { layout: 'table', propertyOverrides: { cover: false } } });

    expect(store.get(KEY)).toEqual({ layout: 'table', propertyOverrides: { cover: false } });
    expect(visibleIn(store, 'table')).toEqual(['name', 'description', 'created', 'updated']);
    expect(visibleIn(store, 'list')).toEqual(['name']);
  });

  it('a retired property snapshot still converts for the Table and does not leak into the List', async () => {
    const store = await loadWith({
      [KEY]: { properties: { description: false, created: true, updated: true, cover: true } },
    });

    expect(visibleIn(store, 'table')).toEqual(['name', 'cover', 'created', 'updated']);
    expect(visibleIn(store, 'list')).toEqual(['name']);
  });

  it('a malformed `listPropertyOverrides` is dropped; the rest of the entry survives', async () => {
    const store = await loadWith({ [KEY]: { layout: 'list', listPropertyOverrides: { cover: 'yes', nope: true } } });

    expect(store.get(KEY)).toEqual({ layout: 'list' });
  });

  it('a collection whose own default layout is the List (Tasks) keeps choices saved before the List had its own', () => {
    const config = { propertyOverrides: { dueDate: false } } as const;

    expect(resolveCollectionView(TASKS_COLLECTION, config).visible).toEqual(['name', 'source']);
    // Once the List is customized it has its own, and the shared ones no longer drive it.
    expect(
      resolveCollectionView(TASKS_COLLECTION, { ...config, listPropertyOverrides: { source: false } }).visible
    ).toEqual(['name', 'dueDate']);
  });
});
