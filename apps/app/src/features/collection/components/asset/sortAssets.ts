import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { ASSET_KIND_LABEL } from './assetKind';

/**
 * What an asset collection can be ordered by. A resource has only a name and a
 * kind, so those are the only two — there are no dates to sort by.
 */
export type AssetSortKey = 'name' | 'type';

export interface AssetSort {
  readonly key: string;
  /**
   * The arrow shown, not an abstract ordering — the same convention the notes'
   * Sort by uses: `'down'` is A→Z (by name, or by the kind's label), `'up'`
   * the reverse.
   */
  readonly direction: 'down' | 'up';
}

/**
 * A sorted copy of `resources` (never mutates its input). Name orders by the
 * name shown (extension-free, locale-aware); Type orders by the kind's label
 * (Image before PDF, A→Z) with the name breaking ties. Any other key — one
 * assets don't have — leaves the order exactly as given, rather than inventing
 * a comparison.
 */
export function sortAssets(resources: readonly VaultResource[], sort: AssetSort): VaultResource[] {
  const copy = [...resources];
  const byName = (a: VaultResource, b: VaultResource) =>
    getResourceDisplayName(a).localeCompare(getResourceDisplayName(b));

  let compare: ((a: VaultResource, b: VaultResource) => number) | null = null;
  if (sort.key === 'name') {
    compare = byName;
  } else if (sort.key === 'type') {
    compare = (a, b) => ASSET_KIND_LABEL[a.kind].localeCompare(ASSET_KIND_LABEL[b.kind]) || byName(a, b);
  }

  if (compare === null) {
    return copy;
  }

  const direction = sort.direction === 'down' ? 1 : -1;
  return copy.sort((a, b) => direction * compare(a, b));
}
