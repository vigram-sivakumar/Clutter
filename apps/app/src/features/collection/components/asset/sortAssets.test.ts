import { describe, expect, it } from 'vitest';

import type { Asset } from '@core/vault/models/Asset';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { localAsset } from '@core/vault/testing/localAsset';

import { sortAssets } from './sortAssets';

const r = (id: string, name: string, kind: VaultResource['kind']): Asset =>
  localAsset({ id, kind, name, path: `/vault/${name}`, parentId: null });
const resources = () => [
  r('1', 'zebra.png', 'image'),
  r('2', 'apple.pdf', 'pdf'),
  r('3', 'mango.png', 'image'),
  r('4', 'banana.pdf', 'pdf'),
];
const ids = (list: Asset[]) => list.map((x) => x.id);

describe('sortAssets', () => {
  it('Name down is A→Z by the name shown (extension-free)', () => {
    expect(ids(sortAssets(resources(), { key: 'name', direction: 'down' }))).toEqual(['2', '4', '3', '1']);
  });

  it('Name up is Z→A', () => {
    expect(ids(sortAssets(resources(), { key: 'name', direction: 'up' }))).toEqual(['1', '3', '4', '2']);
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
      expect(ids(sortAssets(facts(), { key: 'size', direction: 'down' }))).toEqual(['l', 'm', 's', 'x']);
      expect(ids(sortAssets(facts(), { key: 'size', direction: 'up' }))).toEqual(['s', 'm', 'l', 'x']);
    });

    it('Created down is newest first, up is oldest first', () => {
      expect(ids(sortAssets(facts(), { key: 'created', direction: 'down' }))).toEqual(['l', 'm', 's', 'x']);
      expect(ids(sortAssets(facts(), { key: 'created', direction: 'up' }))).toEqual(['s', 'm', 'l', 'x']);
    });

    it('Last edited orders by the modified time, newest first for down', () => {
      expect(ids(sortAssets(facts(), { key: 'updated', direction: 'down' }))).toEqual(['m', 's', 'l', 'x']);
      expect(ids(sortAssets(facts(), { key: 'updated', direction: 'up' }))).toEqual(['l', 's', 'm', 'x']);
    });

    it('an asset with no such fact (a remote asset, or a part not reported) always sorts last, whichever way — name breaking ties', () => {
      for (const direction of ['down', 'up'] as const) {
        const sorted = sortAssets([remote, ...facts()], { key: 'size', direction });
        // 'nofacts' before 'r' (the remote asset): name order among those with nothing to order by.
        expect(ids(sorted).slice(-2)).toEqual(['x', remote.id]);
      }
    });
  });

  it('is locale-aware and case-insensitive in practice (Apple before banana)', () => {
    const list = [r('b', 'banana.png', 'image'), r('a', 'Apple.png', 'image')];

    expect(ids(sortAssets(list, { key: 'name', direction: 'down' }))).toEqual(['a', 'b']);
  });

  it('a key assets do not have (a description, a cover, a type) leaves the order as given — no invented comparison', () => {
    for (const key of ['description', 'cover', 'type']) {
      expect(ids(sortAssets(resources(), { key, direction: 'down' }))).toEqual(['1', '2', '3', '4']);
    }
  });

  it('never mutates its input', () => {
    const input = Object.freeze(resources());

    expect(() => sortAssets(input, { key: 'name', direction: 'down' })).not.toThrow();
    expect(ids([...input])).toEqual(['1', '2', '3', '4']);
  });
});
