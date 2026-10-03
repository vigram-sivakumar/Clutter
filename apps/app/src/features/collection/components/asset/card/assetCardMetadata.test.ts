import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultResource } from '@core/vault/models/VaultResource';

import { assetCardMetadata } from './assetCardMetadata';

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
    const line = assetCardMetadata(
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
    expect(assetCardMetadata(resource({ size: 812, createdAt: null, modifiedAt: '2026-10-03T11:55:00.000Z' }))).toEqual(
      [
        { label: 'Size', value: '812 B' },
        { label: 'Edited', value: '5 minutes ago' },
      ]
    );
    expect(assetCardMetadata(resource({ size: 2_000_000, createdAt: null, modifiedAt: null }))).toEqual([{ label: 'Size', value: '2 MB' }]);
  });

  it('is empty when the resource has no metadata', () => {
    expect(assetCardMetadata(resource())).toEqual([]);
  });

  it('leaves out each item its property hides, independently', () => {
    const full = resource({ size: 12_345, createdAt: '2026-10-03T11:25:00.000Z', modifiedAt: '2026-10-03T11:55:00.000Z' });

    const labels = (visibility: Parameters<typeof assetCardMetadata>[1]) => assetCardMetadata(full, visibility).map((item) => item.label);

    expect(labels({ size: false })).toEqual(['Created', 'Edited']);
    expect(labels({ created: false })).toEqual(['Size', 'Edited']);
    expect(labels({ updated: false })).toEqual(['Size', 'Created']);
    expect(labels({ size: false, created: false, updated: false })).toEqual([]);
  });
});
