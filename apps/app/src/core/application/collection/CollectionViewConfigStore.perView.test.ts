import { describe, expect, it } from 'vitest';

import { CollectionViewConfigStore } from './CollectionViewConfigStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { ARCHIVE_COLLECTION, FOLDER_COLLECTION } from '../../presentation/collection/collectionDefinitions';
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
 * Every view mode keeps its OWN visible-property selection against the one shared registry: nothing a
 * user does in one layout is visible in another, and a layout with nothing saved shows its own default
 * (the List: the Title only) without that default ever being written.
 */

const ROOT = '/vault';
const KEY = 'folder:f1';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const TABLE_DEFAULT = ['name', 'description', 'cover', 'created', 'updated'];

/** What the page does for one toggle in `layout` of `definition`. */
function toggle(
  store: CollectionViewConfigStore,
  layout: CollectionLayout,
  id: PropertyId,
  visible: boolean,
  definition = FOLDER_COLLECTION
) {
  const config = toCollectionViewConfig(definition, store.get(KEY));
  store.update(
    KEY,
    propertyOverridesPatch(
      layout,
      setPropertyVisibility(definition, layout, propertyOverridesFor(definition, config, layout), id, visible),
      config
    )
  );
}

const visibleIn = (store: CollectionViewConfigStore, layout: CollectionLayout, definition = FOLDER_COLLECTION) =>
  resolveCollectionView(definition, { ...toCollectionViewConfig(definition, store.get(KEY)), layout }).visible;

const newStore = (fileSystem = new InMemoryVaultFileSystem()) => CollectionViewConfigStore.load(fileSystem, ROOT);

describe('each view mode has its own visible properties', () => {
  it('1. first use of the List: its own default — the Title only — and nothing is persisted for it', async () => {
    const store = await newStore();

    expect(visibleIn(store, 'list')).toEqual(['name']);
    store.update(KEY, { layout: 'list' });
    expect(store.get(KEY)).toEqual({ layout: 'list' });
  });

  it('2. first use of the Table: its existing default, and nothing is persisted for it', async () => {
    const store = await newStore();

    expect(visibleIn(store, 'table')).toEqual(TABLE_DEFAULT);
    store.update(KEY, { layout: 'table' });
    expect(store.get(KEY)).toEqual({ layout: 'table' });
  });

  it('3. customizing the List leaves the Table unchanged', async () => {
    const store = await newStore();
    toggle(store, 'table', 'cover', false);
    const table = visibleIn(store, 'table');

    toggle(store, 'list', 'created', true);
    toggle(store, 'list', 'updated', true);

    expect(visibleIn(store, 'list')).toEqual(['name', 'created', 'updated']);
    expect(visibleIn(store, 'table')).toEqual(table);
  });

  it('4. customizing the Table leaves the List unchanged', async () => {
    const store = await newStore();
    toggle(store, 'list', 'cover', true);
    const list = visibleIn(store, 'list');

    toggle(store, 'table', 'description', false);
    toggle(store, 'table', 'updated', false);

    expect(visibleIn(store, 'table')).toEqual(['name', 'cover', 'created']);
    expect(visibleIn(store, 'list')).toEqual(list);
  });

  it('5. List → Table → List restores the List configuration', async () => {
    const store = await newStore();
    toggle(store, 'list', 'cover', true);
    toggle(store, 'list', 'created', true);
    toggle(store, 'table', 'cover', false);

    store.update(KEY, { layout: 'table' });
    expect(visibleIn(store, 'table')).toEqual(['name', 'description', 'created', 'updated']);
    store.update(KEY, { layout: 'list' });

    expect(visibleIn(store, 'list')).toEqual(['name', 'cover', 'created']);
  });

  it('6. Table → List → Table restores the Table configuration', async () => {
    const store = await newStore();
    toggle(store, 'table', 'cover', false);
    toggle(store, 'table', 'updated', false);
    toggle(store, 'list', 'created', true);

    store.update(KEY, { layout: 'list' });
    store.update(KEY, { layout: 'table' });

    expect(visibleIn(store, 'table')).toEqual(['name', 'description', 'created']);
  });

  it('7. each view persists its own configuration independently, across a restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await newStore(fileSystem);
    toggle(store, 'table', 'cover', false);
    toggle(store, 'list', 'created', true);
    toggle(store, 'card', 'description', false);
    await flush();

    const reloaded = await newStore(fileSystem);

    expect(reloaded.get(KEY)).toEqual({
      propertyOverrides: { cover: false },
      listPropertyOverrides: { created: true },
      layoutPropertyOverrides: { card: { description: false } },
    });
    expect(visibleIn(reloaded, 'table')).toEqual(['name', 'description', 'created', 'updated']);
    expect(visibleIn(reloaded, 'list')).toEqual(['name', 'created']);
    expect(visibleIn(reloaded, 'card')).toEqual(['name', 'cover', 'created', 'updated']);
  });

  it('the Card does not borrow the Table\'s choices, nor the Table the Card\'s', async () => {
    const store = await newStore();
    toggle(store, 'table', 'cover', false);
    expect(visibleIn(store, 'card')).toEqual(TABLE_DEFAULT);

    toggle(store, 'card', 'updated', false);
    expect(visibleIn(store, 'table')).toEqual(['name', 'description', 'created', 'updated']);
    expect(visibleIn(store, 'card')).toEqual(['name', 'description', 'cover', 'created']);
  });

  it('returning a layout to its defaults clears only that layout\'s entry', async () => {
    const store = await newStore();
    toggle(store, 'card', 'cover', false);
    toggle(store, 'list', 'cover', true);

    toggle(store, 'card', 'cover', true);

    expect(store.get(KEY)).toEqual({ listPropertyOverrides: { cover: true } });
  });

  it('the Archive follows the same rule: its List and Table are configured separately', async () => {
    const store = await newStore();
    toggle(store, 'table', 'type', false, ARCHIVE_COLLECTION);
    toggle(store, 'list', 'type', true, ARCHIVE_COLLECTION);

    expect(visibleIn(store, 'table', ARCHIVE_COLLECTION)).toEqual(['name', 'archived']);
    expect(visibleIn(store, 'list', ARCHIVE_COLLECTION)).toEqual(['name', 'type']);
  });

  it('8. a view mode added later gets its own configuration without sharing another view\'s', () => {
    const gallery = 'gallery' as CollectionLayout;
    const definition = { ...FOLDER_COLLECTION, layouts: [...FOLDER_COLLECTION.layouts, gallery] };
    const shared = {
      propertyOverrides: { cover: false },
      listPropertyOverrides: { created: true },
      layoutPropertyOverrides: { card: { updated: false } },
    };

    // Nothing saved for it: it shows the collection default, not the Table's, List's or Card's choices.
    expect(resolveCollectionView(definition, { ...shared, layout: gallery }).visible).toEqual(TABLE_DEFAULT);

    // Its own choice is stored under its own entry and leaves every other layout's alone.
    const patch = propertyOverridesPatch(gallery, { description: false }, shared);
    const config = { ...shared, ...patch, layout: gallery };

    expect(patch.layoutPropertyOverrides).toEqual({ card: { updated: false }, gallery: { description: false } });
    expect(resolveCollectionView(definition, config).visible).toEqual(['name', 'cover', 'created', 'updated']);
    expect(config.propertyOverrides).toEqual(shared.propertyOverrides);
    expect(config.listPropertyOverrides).toEqual(shared.listPropertyOverrides);
    expect(propertyOverridesFor(definition, config, 'card')).toEqual({ updated: false });
  });

  it('a malformed or unknown-layout entry in the saved file is dropped; the valid ones survive', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({
        collectionViewConfig: {
          [KEY]: { layoutPropertyOverrides: { card: { cover: false }, hologram: { cover: true }, list: 'yes' } },
        },
      }),
    });

    expect((await newStore(fileSystem)).get(KEY)).toEqual({ layoutPropertyOverrides: { card: { cover: false } } });
  });
});
