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

  it('Type down groups by kind label (Image, then PDF), with the name breaking ties', () => {
    expect(ids(sortAssets(resources(), { key: 'type', direction: 'down' }))).toEqual(['3', '1', '2', '4']);
  });

  it('Type up reverses it (PDFs first, then images, names Z→A within each)', () => {
    expect(ids(sortAssets(resources(), { key: 'type', direction: 'up' }))).toEqual(['4', '2', '1', '3']);
  });

  it('is locale-aware and case-insensitive in practice (Apple before banana)', () => {
    const list = [r('b', 'banana.png', 'image'), r('a', 'Apple.png', 'image')];

    expect(ids(sortAssets(list, { key: 'name', direction: 'down' }))).toEqual(['a', 'b']);
  });

  it('a key assets do not have (a date) leaves the order as given — no invented comparison', () => {
    expect(ids(sortAssets(resources(), { key: 'created', direction: 'down' }))).toEqual(['1', '2', '3', '4']);
    expect(ids(sortAssets(resources(), { key: 'updated', direction: 'up' }))).toEqual(['1', '2', '3', '4']);
  });

  it('never mutates its input', () => {
    const input = Object.freeze(resources());

    expect(() => sortAssets(input, { key: 'name', direction: 'down' })).not.toThrow();
    expect(ids([...input])).toEqual(['1', '2', '3', '4']);
  });
});
