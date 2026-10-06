import { describe, expect, it } from 'vitest';

import type { Asset } from '@core/vault/models/Asset';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { localAsset } from '@core/vault/testing/localAsset';

import { sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import { isPropertyId, type PropertyId } from '@core/properties/collectionProperties';

import { ASSET_SORT_OPTIONS, toAssetEntry } from './toAssetEntry';

/** What the assets collection does: the asset adapter's values, ordered by the one sort engine. */
const sortAssets = (assets: readonly Asset[], sort: CollectionSort): Asset[] =>
  sortEntries(assets.map((asset) => toAssetEntry(asset)), sort, ASSET_SORT_OPTIONS).map((entry) => entry.asset);

const r = (id: string, name: string, kind: VaultResource['kind']): Asset =>
  localAsset({ id, kind, name, path: `/vault/${name}`, parentId: null });
const resources = () => [
  r('1', 'zebra.png', 'image'),
  r('2', 'apple.pdf', 'pdf'),
  r('3', 'mango.png', 'image'),
  r('4', 'banana.pdf', 'pdf'),
];
const ids = (list: Asset[]) => list.map((x) => x.id);

describe('sorting assets (toAssetEntry + sortEntries with the assets\' tie-breaks)', () => {
  it('Name down is A→Z by the name shown (extension-free)', () => {
    expect(ids(sortAssets(resources(), { property: 'name', direction: 'down' }))).toEqual(['2', '4', '3', '1']);
  });

  it('Name up is Z→A', () => {
    expect(ids(sortAssets(resources(), { property: 'name', direction: 'up' }))).toEqual(['1', '3', '4', '2']);
  });

  describe('file facts — File size, Created, Last edited', () => {
    const withFacts = (id: string, name: string, size: number | undefined, createdAt: string | null, modifiedAt: string | null): Asset =>
      localAsset({
        id,
        kind: 'image',
        name,
        path: `/vault/${name}`,
        parentId: null,
        metadata: size === undefined ? undefined : { size, createdAt, modifiedAt },
      });
    const facts = () => [
      withFacts('s', 'small.png', 10, '2020-01-01T00:00:00.000Z', '2021-05-01T00:00:00.000Z'),
      withFacts('l', 'large.png', 5000, '2022-03-01T00:00:00.000Z', '2020-02-01T00:00:00.000Z'),
      withFacts('m', 'medium.png', 700, '2021-06-01T00:00:00.000Z', '2023-07-01T00:00:00.000Z'),
      withFacts('x', 'nofacts.png', undefined, null, null),
    ];
    const remote: Asset = {
      id: 'remote:https://example.com/r.jpg',
      source: 'remote',
      kind: 'image',
      name: 'r.jpg',
      url: 'https://example.com/r.jpg',
      references: [],
    };

    it('File size down is largest first, up is smallest first', () => {
      expect(ids(sortAssets(facts(), { property: 'size', direction: 'down' }))).toEqual(['l', 'm', 's', 'x']);
      expect(ids(sortAssets(facts(), { property: 'size', direction: 'up' }))).toEqual(['s', 'm', 'l', 'x']);
    });

    it('Created down is newest first, up is oldest first', () => {
      expect(ids(sortAssets(facts(), { property: 'created', direction: 'down' }))).toEqual(['l', 'm', 's', 'x']);
      expect(ids(sortAssets(facts(), { property: 'created', direction: 'up' }))).toEqual(['s', 'm', 'l', 'x']);
    });

    it('Last edited orders by the modified time, newest first for down', () => {
      expect(ids(sortAssets(facts(), { property: 'updated', direction: 'down' }))).toEqual(['m', 's', 'l', 'x']);
      expect(ids(sortAssets(facts(), { property: 'updated', direction: 'up' }))).toEqual(['l', 's', 'm', 'x']);
    });

    it('an asset with no such fact (a remote asset, or a part not reported) always sorts last, whichever way — name breaking ties', () => {
      for (const direction of ['down', 'up'] as const) {
        const sorted = sortAssets([remote, ...facts()], { property: 'size', direction });
        // 'nofacts' before 'r' (the remote asset): name order among those with nothing to order by.
        expect(ids(sorted).slice(-2)).toEqual(['x', remote.id]);
      }
    });
  });

  it('is locale-aware and case-insensitive in practice (Apple before banana)', () => {
    const list = [r('b', 'banana.png', 'image'), r('a', 'Apple.png', 'image')];

    expect(ids(sortAssets(list, { property: 'name', direction: 'down' }))).toEqual(['a', 'b']);
  });

  it('a property assets do not have (a description, a cover, an archived date) leaves the order as given — no invented comparison', () => {
    for (const property of ['description', 'cover', 'archived'] as const) {
      expect(ids(sortAssets(resources(), { property, direction: 'down' }))).toEqual(['1', '2', '3', '4']);
    }
  });

  it('never mutates its input', () => {
    const input = Object.freeze(resources());

    expect(() => sortAssets(input, { property: 'name', direction: 'down' })).not.toThrow();
    expect(ids([...input])).toEqual(['1', '2', '3', '4']);
  });
});

describe('toAssetEntry — where an asset\'s collection property values come from', () => {
  const facts = { size: 12_345, createdAt: '2020-01-02T03:04:05.000Z', modifiedAt: '2020-02-03T04:05:06.000Z' };

  it('a vault file: its extension-free name, and the file\'s own size, created and modified times (raw)', () => {
    const asset = localAsset({ id: 'a', kind: 'image', name: 'house.png', path: '/vault/Assets/house.png', parentId: null, metadata: facts });

    expect(toAssetEntry(asset).values).toEqual({
      name: 'house',
      size: 12_345,
      created: facts.createdAt,
      updated: facts.modifiedAt,
    });
  });

  it('a vault file the platform could not stat has only a name', () => {
    expect(toAssetEntry(localAsset({ id: 'a', kind: 'image', name: 'house.png', path: '/vault/house.png', parentId: null })).values).toEqual({
      name: 'house',
    });
  });

  it('a part the platform did not report is left out; a zero size is a real size', () => {
    const partial = localAsset({
      id: 'a',
      kind: 'image',
      name: 'empty.png',
      path: '/vault/empty.png',
      parentId: null,
      metadata: { size: 0, createdAt: null, modifiedAt: facts.modifiedAt },
    });

    expect(toAssetEntry(partial).values).toEqual({ name: 'empty', size: 0, updated: facts.modifiedAt });
  });

  it('a remote asset is a URL with no file: only its name', () => {
    const remote: Asset = { id: 'remote:https://example.com/r.jpg', source: 'remote', kind: 'image', name: 'r.jpg', url: 'https://example.com/r.jpg', references: [] };

    expect(toAssetEntry(remote).values).toEqual({ name: 'r' });
  });

  it('an archived file carries the date the app archived it as its `archived` value — and never as created or updated', () => {
    const asset = localAsset({ id: 'a', kind: 'image', name: 'h.png', path: '/vault/Archive/h.png', parentId: null, metadata: facts });

    const { values } = toAssetEntry(asset, '2026-10-06T09:30:00.000Z');

    expect(values.archived).toBe('2026-10-06T09:30:00.000Z');
    expect(values.created).toBe(facts.createdAt);
    expect(values.updated).toBe(facts.modifiedAt);
  });

  it('with no archive date (archived before it was recorded, or not an archived file) there is no archived value', () => {
    const asset = localAsset({ id: 'a', kind: 'image', name: 'h.png', path: '/vault/Archive/h.png', parentId: null });

    expect('archived' in toAssetEntry(asset).values).toBe(false);
    expect('archived' in toAssetEntry(asset, undefined).values).toBe(false);
  });

  it('every value key it can produce is a registered property', () => {
    const asset = localAsset({ id: 'a', kind: 'image', name: 'h.png', path: '/vault/h.png', parentId: null, metadata: facts });

    for (const key of Object.keys(toAssetEntry(asset).values)) {
      expect(isPropertyId(key), key).toBe(true);
    }
    const asId: PropertyId = 'size';
    expect(asId).toBe('size');
  });
});
