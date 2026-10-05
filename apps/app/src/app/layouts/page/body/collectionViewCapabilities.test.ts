import { describe, expect, it } from 'vitest';

import { DEFAULT_COLLECTION_PROPERTY_VISIBILITY } from './CollectionBody';
import type { CollectionSort } from '@core/properties/collectionSort';

import {
  ASSET_COLLECTION_VIEW_CAPABILITIES,
  NOTE_COLLECTION_VIEW_CAPABILITIES,
  resolveDefaultProperties,
  resolveSupportedLayout,
  resolveSupportedSort,
} from './collectionViewCapabilities';

describe('collection view capabilities', () => {
  it('notes keep every layout, properties and sort, defaulting to Table (unchanged)', () => {
    expect(NOTE_COLLECTION_VIEW_CAPABILITIES).toEqual({
      layouts: ['list', 'table', 'card'],
      defaultLayout: 'table',
      properties: true,
      sortKeys: ['name', 'description', 'cover', 'created', 'updated', 'archived'],
    });
  });

  it('assets support the same three layouts as notes (Card is registered through the same layout list), open in Card by default, and offer file-fact properties in every layout', () => {
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.layouts).toEqual(NOTE_COLLECTION_VIEW_CAPABILITIES.layouts);
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.layouts).toEqual(['list', 'table', 'card']);
    // First-time default: Card (notes still default to Table).
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.defaultLayout).toBe('card');
    expect(NOTE_COLLECTION_VIEW_CAPABILITIES.defaultLayout).toBe('table');
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.properties).toBe(true);
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.propertyKeys).toEqual(['title', 'size', 'created', 'updated']);
    expect(NOTE_COLLECTION_VIEW_CAPABILITIES.propertyKeys).toBeUndefined();
    // Sort by offers Name and the file facts the Properties show.
    expect(ASSET_COLLECTION_VIEW_CAPABILITIES.sortKeys).toEqual(['name', 'size', 'created', 'updated']);
  });

  it('resolveSupportedLayout keeps a supported persisted layout and otherwise returns the default', () => {
    expect(resolveSupportedLayout('card', ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('card');
    expect(resolveSupportedLayout('table', ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('table');
    expect(resolveSupportedLayout(undefined, ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('card');
    expect(resolveSupportedLayout('list', ASSET_COLLECTION_VIEW_CAPABILITIES)).toBe('list');
    expect(resolveSupportedLayout('table', NOTE_COLLECTION_VIEW_CAPABILITIES)).toBe('table');
    expect(resolveSupportedLayout(undefined, NOTE_COLLECTION_VIEW_CAPABILITIES)).toBe('table');

    // A collection that doesn't offer a layout falls back to its default for it.
    const listAndCardOnly = { ...ASSET_COLLECTION_VIEW_CAPABILITIES, layouts: ['list', 'card'] as const };
    expect(resolveSupportedLayout('table', listAndCardOnly)).toBe('card');
  });

  it('resolveSupportedSort keeps a sort the collection offers and otherwise falls back', () => {
    const fallback: CollectionSort = { property: 'name', direction: 'down' };

    expect(resolveSupportedSort({ property: 'size', direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
      property: 'size',
      direction: 'up',
    });
    expect(resolveSupportedSort({ property: 'created', direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
      property: 'created',
      direction: 'up',
    });
    // Assets have no description or cover: a persisted sort by one is not honoured.
    expect(resolveSupportedSort({ property: 'description', direction: 'up' }, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    expect(resolveSupportedSort(undefined, ASSET_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    // Notes have no file size: a stray one falls back for them too.
    expect(resolveSupportedSort({ property: 'size', direction: 'down' }, NOTE_COLLECTION_VIEW_CAPABILITIES, fallback)).toBe(fallback);
    expect(resolveSupportedSort({ property: 'updated', direction: 'up' }, NOTE_COLLECTION_VIEW_CAPABILITIES, fallback)).toEqual({
      property: 'updated',
      direction: 'up',
    });
  });

  it("assets start with only their title/name: the file facts default off in every layout, while notes keep every default", () => {
    expect(resolveDefaultProperties(ASSET_COLLECTION_VIEW_CAPABILITIES)).toEqual({
      ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
      size: false,
      created: false,
      updated: false,
    });
    expect(resolveDefaultProperties(ASSET_COLLECTION_VIEW_CAPABILITIES).title).toBe(true);
    expect(resolveDefaultProperties(NOTE_COLLECTION_VIEW_CAPABILITIES)).toEqual(DEFAULT_COLLECTION_PROPERTY_VISIBILITY);
  });
});
