import { describe, expect, it } from 'vitest';

import { PROPERTY_IDS, type PropertyId } from '@core/properties/collectionProperties';

import {
  ARCHIVE_COLLECTION,
  ASSETS_COLLECTION,
  FOLDER_COLLECTION,
  type CollectionDefinition,
} from './collectionDefinitions';
import {
  migrateLegacyProperties,
  requiredProperties,
  resolveCollectionView,
  setPropertyVisibility,
  toCollectionViewConfig,
} from './resolveCollectionView';

/** A definition whose membership array is deliberately in a different order from the registry's. */
const SCRAMBLED: CollectionDefinition = {
  ...FOLDER_COLLECTION,
  properties: ['updated', 'cover', 'name', 'created', 'description'],
  defaultVisible: ['updated', 'name', 'description'],
};

describe('resolveCollectionView — order and membership', () => {
  it('canonical (registry) order wins over the definition\'s array order', () => {
    const view = resolveCollectionView(SCRAMBLED);

    expect(view.available).toEqual(['name', 'description', 'cover', 'created', 'updated']);
    expect(view.visible).toEqual(['name', 'description', 'updated']);
    expect(view.sortable).toEqual(['name', 'description', 'cover', 'created', 'updated']);
  });

  it('every resolved list is a registry-ordered subsequence', () => {
    for (const definition of [FOLDER_COLLECTION, ARCHIVE_COLLECTION, ASSETS_COLLECTION, SCRAMBLED]) {
      const view = resolveCollectionView(definition, {
        propertyOverrides: { size: true, archived: true, cover: false, created: false },
      });
      const inRegistryOrder = (ids: readonly PropertyId[]) => [...ids].sort((a, b) => PROPERTY_IDS.indexOf(a) - PROPERTY_IDS.indexOf(b));

      expect(view.available).toEqual(inRegistryOrder(view.available));
      expect(view.visible).toEqual(inRegistryOrder(view.visible));
      expect(view.locked).toEqual(inRegistryOrder(view.locked));
      expect(view.sortable).toEqual(inRegistryOrder(view.sortable));
    }
  });

  it('a property the collection does not offer never appears, even if the config mentions it', () => {
    const view = resolveCollectionView(ASSETS_COLLECTION, { propertyOverrides: { archived: true, description: true, cover: true } });

    expect(view.available).toEqual(['name', 'size', 'created', 'updated']);
    expect(view.visible).toEqual(['name']);
  });

  it('Sort by is the sortable subset of the available properties — the same list, filtered', () => {
    const view = resolveCollectionView(ARCHIVE_COLLECTION);

    expect(view.available).toEqual(['name', 'description', 'created', 'updated', 'archived']);
    expect(view.sortable).toEqual(view.available.filter((id) => view.sortable.includes(id)));
    expect(view.sortable).toEqual(['name', 'description', 'created', 'updated', 'archived']);
  });
});

describe('resolveCollectionView — defaults and overrides', () => {
  it('with no config: the definition\'s default layout, visible set and sort', () => {
    const notes = resolveCollectionView(FOLDER_COLLECTION);
    expect(notes.layout).toBe('table');
    expect(notes.visible).toEqual(['name', 'description', 'cover', 'created', 'updated']);
    expect(notes.sort).toEqual({ property: 'name', direction: 'down' });

    const assets = resolveCollectionView(ASSETS_COLLECTION);
    expect(assets.layout).toBe('card');
    expect(assets.visible).toEqual(['name']);
  });

  it('`false` hides a default-visible property and `true` shows a default-hidden one', () => {
    expect(resolveCollectionView(FOLDER_COLLECTION, { propertyOverrides: { cover: false } }).visible).toEqual([
      'name',
      'description',
      'created',
      'updated',
    ]);
    expect(resolveCollectionView(ASSETS_COLLECTION, { layout: 'table', propertyOverrides: { size: true } }).visible).toEqual([
      'name',
      'size',
    ]);
  });

  it('an unsupported persisted layout falls back to the default layout', () => {
    const noCard: CollectionDefinition = { ...FOLDER_COLLECTION, layouts: ['list', 'table'] };

    expect(resolveCollectionView(noCard, { layout: 'card' }).layout).toBe('table');
    expect(resolveCollectionView(noCard, { layout: 'list' }).layout).toBe('list');
  });

  it('a persisted sort the collection offers (and can sort) is kept', () => {
    expect(resolveCollectionView(ASSETS_COLLECTION, { sort: { property: 'size', direction: 'up' } }).sort).toEqual({
      property: 'size',
      direction: 'up',
    });
    expect(resolveCollectionView(ARCHIVE_COLLECTION, { sort: { property: 'archived', direction: 'down' } }).sort).toEqual({
      property: 'archived',
      direction: 'down',
    });
  });

  it('an invalid persisted sort falls back to the definition\'s defaultSort — a property not offered…', () => {
    expect(resolveCollectionView(ASSETS_COLLECTION, { sort: { property: 'description', direction: 'up' } }).sort).toEqual(
      ASSETS_COLLECTION.defaultSort
    );
    expect(resolveCollectionView(FOLDER_COLLECTION, { sort: { property: 'size', direction: 'up' } }).sort).toEqual(
      FOLDER_COLLECTION.defaultSort
    );
  });

  it('…and the fallback is the DEFINITION\'s, not a global one', () => {
    const byCreated: CollectionDefinition = { ...FOLDER_COLLECTION, defaultSort: { property: 'created', direction: 'up' } };

    expect(resolveCollectionView(byCreated, { sort: { property: 'size', direction: 'down' } }).sort).toEqual({
      property: 'created',
      direction: 'up',
    });
  });
});

describe('resolveCollectionView — required properties', () => {
  it('Name is required, visible and locked in List, Table and Card for a note collection', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const view = resolveCollectionView(FOLDER_COLLECTION, { layout });

      expect(view.locked, layout).toEqual(['name']);
      expect(view.visible, layout).toContain('name');
    }
  });

  it('a persisted `false` for a required property cannot hide it', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const view = resolveCollectionView(FOLDER_COLLECTION, { layout, propertyOverrides: { name: false } });

      expect(view.visible, layout).toContain('name');
      expect(view.locked, layout).toEqual(['name']);
    }
  });

  it('the Asset card is the exception: Name is optional there (hideable), required in List and Table', () => {
    const card = resolveCollectionView(ASSETS_COLLECTION, { layout: 'card', propertyOverrides: { name: false } });
    expect(card.locked).toEqual([]);
    expect(card.visible).toEqual([]);

    for (const layout of ['list', 'table'] as const) {
      const view = resolveCollectionView(ASSETS_COLLECTION, { layout, propertyOverrides: { name: false } });
      expect(view.locked, layout).toEqual(['name']);
      expect(view.visible, layout).toEqual(['name']);
    }
  });

  it('the same stored `name: false` hides the asset name in the Card and not in the List — required is per layout', () => {
    const overrides = { name: false };

    expect(resolveCollectionView(ASSETS_COLLECTION, { layout: 'card', propertyOverrides: overrides }).visible).not.toContain('name');
    expect(resolveCollectionView(ASSETS_COLLECTION, { layout: 'list', propertyOverrides: overrides }).visible).toContain('name');
  });

  it('a required property the collection does not offer is ignored rather than invented', () => {
    const nameless: CollectionDefinition = { ...FOLDER_COLLECTION, properties: ['description'], defaultVisible: ['description'], defaultSort: { property: 'description', direction: 'down' } };

    expect(resolveCollectionView(nameless).locked).toEqual([]);
    expect(requiredProperties(nameless, 'table')).toEqual(['name']);
  });
});

describe('setPropertyVisibility — what a toggle writes', () => {
  it('records an override only when the choice differs from the default', () => {
    expect(setPropertyVisibility(FOLDER_COLLECTION, 'table', undefined, 'cover', false)).toEqual({ cover: false });
    expect(setPropertyVisibility(FOLDER_COLLECTION, 'table', undefined, 'cover', true)).toBeUndefined();
    expect(setPropertyVisibility(ASSETS_COLLECTION, 'table', undefined, 'size', true)).toEqual({ size: true });
  });

  it('returning a property to its default REMOVES its override (no opinion), keeping the others', () => {
    const next = setPropertyVisibility(FOLDER_COLLECTION, 'table', { cover: false, created: false }, 'cover', true);

    expect(next).toEqual({ created: false });
  });

  it('never creates an override for a required property — a locked toggle changes nothing', () => {
    expect(setPropertyVisibility(FOLDER_COLLECTION, 'table', undefined, 'name', false)).toBeUndefined();
    expect(setPropertyVisibility(FOLDER_COLLECTION, 'card', { cover: false }, 'name', false)).toEqual({ cover: false });
  });

  it('the Asset card can hide Name; the Asset table cannot', () => {
    expect(setPropertyVisibility(ASSETS_COLLECTION, 'card', undefined, 'name', false)).toEqual({ name: false });
    expect(setPropertyVisibility(ASSETS_COLLECTION, 'table', undefined, 'name', false)).toBeUndefined();
  });

  it('ignores a property the collection does not offer', () => {
    expect(setPropertyVisibility(ASSETS_COLLECTION, 'card', undefined, 'description', true)).toBeUndefined();
  });
});

describe('legacy snapshot → overrides', () => {
  const SNAPSHOT_ALL_TRUE = { description: true, created: true, updated: true, archived: true, cover: true, preview: true, title: true, size: true } as const;

  it('a snapshot that is only defaults produces no override at all', () => {
    expect(migrateLegacyProperties(FOLDER_COLLECTION, SNAPSHOT_ALL_TRUE)).toBeUndefined();
    expect(migrateLegacyProperties(ARCHIVE_COLLECTION, SNAPSHOT_ALL_TRUE)).toBeUndefined();
  });

  it('keeps what the user hid: only differences from the collection\'s default become overrides', () => {
    expect(migrateLegacyProperties(FOLDER_COLLECTION, { ...SNAPSHOT_ALL_TRUE, cover: false, created: false })).toEqual({
      cover: false,
      created: false,
    });
  });

  it('ignores properties the collection does not offer (the snapshot always held all eight)', () => {
    expect(migrateLegacyProperties(FOLDER_COLLECTION, { ...SNAPSHOT_ALL_TRUE, size: false, archived: false })).toBeUndefined();
  });

  it('drops `preview`', () => {
    expect(migrateLegacyProperties(FOLDER_COLLECTION, { ...SNAPSHOT_ALL_TRUE, preview: false })).toBeUndefined();
  });

  it('assets: size / created / updated are default-OFF, so a snapshot of "on" is a choice and "off" is not', () => {
    expect(
      migrateLegacyProperties(ASSETS_COLLECTION, { ...SNAPSHOT_ALL_TRUE, size: true, created: false, updated: true })
    ).toEqual({ size: true, updated: true });
  });

  it('title becomes the name override', () => {
    expect(migrateLegacyProperties(ASSETS_COLLECTION, { ...SNAPSHOT_ALL_TRUE, size: false, created: false, updated: false, title: false })).toEqual({
      name: false,
    });
    expect(migrateLegacyProperties(ASSETS_COLLECTION, { ...SNAPSHOT_ALL_TRUE, size: false, created: false, updated: false, title: true })).toBeUndefined();
  });

  it('a legacy name override still cannot hide a required Name once resolved', () => {
    const config = toCollectionViewConfig(FOLDER_COLLECTION, { legacyProperties: { ...SNAPSHOT_ALL_TRUE, title: false } });

    // `title` is not a property a note collection offers a toggle for, but even a stored name:false is clamped.
    expect(resolveCollectionView(FOLDER_COLLECTION, { ...config, propertyOverrides: { name: false } }).visible).toContain('name');
  });

  it('keys absent from an older entry are simply not overrides', () => {
    expect(migrateLegacyProperties(FOLDER_COLLECTION, { description: true, created: true, updated: false })).toEqual({ updated: false });
    expect(migrateLegacyProperties(FOLDER_COLLECTION, undefined)).toBeUndefined();
  });
});

describe('toCollectionViewConfig — a stored entry as plain intent', () => {
  it('passes new-shape intent through and converts a legacy snapshot', () => {
    expect(toCollectionViewConfig(FOLDER_COLLECTION, undefined)).toEqual({});
    expect(toCollectionViewConfig(FOLDER_COLLECTION, { layout: 'list', propertyOverrides: { cover: false } })).toEqual({
      layout: 'list',
      propertyOverrides: { cover: false },
    });
    expect(
      toCollectionViewConfig(FOLDER_COLLECTION, {
        layout: 'card',
        sort: { property: 'created', direction: 'up' },
        legacyProperties: { description: true, created: true, updated: false },
      })
    ).toEqual({ layout: 'card', sort: { property: 'created', direction: 'up' }, propertyOverrides: { updated: false } });
  });

  it('new-shape overrides win over a legacy snapshot an entry somehow still carries', () => {
    expect(
      toCollectionViewConfig(FOLDER_COLLECTION, {
        propertyOverrides: { cover: false },
        legacyProperties: { description: true, created: false, updated: true },
      })
    ).toEqual({ propertyOverrides: { cover: false } });
  });

  it('a stored entry with no property intent leaves the defaults alone', () => {
    expect(toCollectionViewConfig(FOLDER_COLLECTION, { layout: 'table' })).toEqual({ layout: 'table' });
  });
});
