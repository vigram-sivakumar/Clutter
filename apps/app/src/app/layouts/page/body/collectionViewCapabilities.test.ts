import { describe, expect, it } from 'vitest';

import type { CollectionSortState } from './CollectionBody';

import {
  ASSET_COLLECTION_VIEW_CAPABILITIES,
  NOTE_COLLECTION_VIEW_CAPABILITIES,
  resolveSupportedLayout,
  resolveSupportedSort,
} from './collectionViewCapabilities';

describe('collection view capabilities', () => {
  it('notes keep every layout, properties and sort, defaulting to Table (unchanged)', () => {
    expect(NOTE_COLLECTION_VIEW_CAPABILITIES).toEqual({
      layouts: ['list', 'table', 'card'],
      defaultLayout: 'table',
      properties: true,
      sortKeys: ['name', 'lastOpened', 'created', 'updated', 'archived'],
    });
  });

  it('assets support the same three layouts as notes (Card is registered through the same layout list), default to List, with nothing to configure', () => {
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.layouts).toEqual(NOTE_COLLECTION_VIEW_CAPABILITIES.layouts);
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.layouts).toEqual(['list', 'table', 'card']);
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.defaultLayout).toBe('list');
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.properties).toBe(false);
    // Sort by offers the two things an asset has.
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.sortKeys).toEqual(['name', 'type']);
  });

  it('resolveSupportedLayout keeps a supported persisted layout and otherwise returns the default', () => {
    expect(resolveSupportedLayout('card', ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('card');
    expect(resolveSupportedLayout('table', ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('table');
    expect(resolveSupportedLayout(undefined, ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('list');
    expect(resolveSupportedLayout('table', NOTE_COLLECTION_VIEW_CAPABILITIES)).toBe('table');
    expect(resolveSupportedLayout(undefined, NOTE_COLLECTION_VIEW_CAPABILITIES)).toBe('table');

    // A collection that doesn't offer a layout falls back to its default for it.
    const listAndCardOnly = { ...ASSET_COLLECTION_VIEW_CAPABILITIES, layouts: ['list', 'card'] as const };
    expect(resolveSupportedLayout('table', listAndCardOnly)).toBe('list');
  });

  it('resolveSupportedSort keeps a sort the collection offers and otherwise falls back', () => {
    const fallback: CollectionSortState = { key: 'name', direction: 'down' };

    expect(resolveSupportedSort({ key: 'type', direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
      key: 'type',
      direction: 'up',
    });
    // Assets have no dates: a date sort persisted for them is not honoured.
    expect(resolveSupportedSort({ key: 'created', direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    expect(resolveSupportedSort(undefined, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    // Notes never offered "type": a stray one falls back for them too.
    expect(resolveSupportedSort({ key: 'type', direction: 'down' }, NOTE_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    expect(resolveSupportedSort({ key: 'updated', direction: 'up' }, NOTE_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
      key: 'updated',
      direction: 'up',
    });
  });
});
