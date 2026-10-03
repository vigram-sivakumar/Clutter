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

    expect(line).toEqual(['12 KB', 'Created 35 minutes ago', 'Edited 5 minutes ago']);
  });

  it('leaves out a part the platform could not report', () => {
    expect(assetCardMetadata(resource({ size: 812, createdAt: null, modifiedAt: '2026-10-03T11:55:00.000Z' }))).toEqual(
      ['812 B', 'Edited 5 minutes ago']
    );
    expect(assetCardMetadata(resource({ size: 2_000_000, createdAt: null, modifiedAt: null }))).toEqual(['2 MB']);
  });

  it('is empty when the resource has no metadata', () => {
    expect(assetCardMetadata(resource())).toEqual([]);
  });

  it('leaves out each item its property hides, independently', () => {
    const full = resource({ size: 12_345, createdAt: '2026-10-03T11:25:00.000Z', modifiedAt: '2026-10-03T11:55:00.000Z' });

    expect(assetCardMetadata(full, { size: false })).toEqual(['Created 35 minutes ago', 'Edited 5 minutes ago']);
    expect(assetCardMetadata(full, { created: false })).toEqual(['12 KB', 'Edited 5 minutes ago']);
    expect(assetCardMetadata(full, { updated: false })).toEqual(['12 KB', 'Created 35 minutes ago']);
    expect(assetCardMetadata(full, { size: false, created: false, updated: false })).toEqual([]);
  });
});
