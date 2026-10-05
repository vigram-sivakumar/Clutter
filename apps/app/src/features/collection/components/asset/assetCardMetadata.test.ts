import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultResource } from '@core/vault/models/VaultResource';

import type { PropertyId } from '@core/properties/collectionProperties';
import { localAsset } from '@core/vault/testing/localAsset';

import { assetCardMetadata } from './assetCardMetadata';
import { toAssetEntry } from './toAssetEntry';

// Every plain-value property an asset card can draw, visible — what the card shows unless narrowed.
const ALL: PropertyId[] = ['name', 'size', 'created', 'updated'];
/** The card's lines for a resource, from the values its adapter produces. */
const linesOf = (r: VaultResource, visible: PropertyId[] = ALL) => assetCardMetadata(toAssetEntry(localAsset(r)).values, visible);

const NOW = new Date('2026-10-03T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const resource = (metadata?: VaultResource['metadata']): VaultResource => ({
  id: 'img',
  kind: 'image',
  name: 'house.png',
  path: '/vault/house.png',
  parentId: null,
  ...(metadata && { metadata }),
});

describe('assetCardMetadata', () => {
  it('is size, Created and Edited, in that order, one item each', () => {
    const line = linesOf(
      resource({
        size: 12_345,
        createdAt: '2026-10-03T11:25:00.000Z',
        modifiedAt: '2026-10-03T11:55:00.000Z',
      })
    );

    expect(line).toEqual([
      { label: 'Size', value: '12 KB' },
      { label: 'Created', value: '35 minutes ago' },
      { label: 'Edited', value: '5 minutes ago' },
    ]);
  });

  it('leaves out a part the platform could not report', () => {
    expect(linesOf(resource({ size: 812, createdAt: null, modifiedAt: '2026-10-03T11:55:00.000Z' }))).toEqual(
      [
        { label: 'Size', value: '812 B' },
        { label: 'Edited', value: '5 minutes ago' },
      ]
    );
    expect(linesOf(resource({ size: 2_000_000, createdAt: null, modifiedAt: null }))).toEqual([{ label: 'Size', value: '2 MB' }]);
  });

  it('is empty when the resource has no metadata', () => {
    expect(linesOf(resource())).toEqual([]);
  });

  it('leaves out each item its property hides, independently', () => {
    const full = resource({ size: 12_345, createdAt: '2026-10-03T11:25:00.000Z', modifiedAt: '2026-10-03T11:55:00.000Z' });

    const labels = (visible: PropertyId[]) => linesOf(full, visible).map((item) => item.label);

    expect(labels(['name', 'created', 'updated'])).toEqual(['Created', 'Edited']);
    expect(labels(['name', 'size', 'updated'])).toEqual(['Size', 'Edited']);
    expect(labels(['name', 'size', 'created'])).toEqual(['Size', 'Created']);
    expect(labels(['name'])).toEqual([]);
  });
});
