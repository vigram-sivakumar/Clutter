import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { Asset } from '@core/vault/models/Asset';

/**
 * What an asset collection can be ordered by: its Name, and the file facts its
 * Properties show — File size, Created and Last edited. (Sort by is the
 * Properties list.)
 */
export type AssetSortKey = 'name' | 'size' | 'created' | 'updated';

export interface AssetSort {
  readonly key: string;
  /**
   * The arrow shown, not an abstract ordering — the same convention the notes'
   * Sort by uses: `'down'` is A→Z by name, largest first by file size and
   * newest first by date; `'up'` the reverse.
   */
  readonly direction: 'down' | 'up';
}

/** The raw value a size/date key orders by, or undefined when the asset has none (a remote asset has no file; the platform may not report a part). */
function factOf(asset: Asset, key: 'size' | 'created' | 'updated'): number | string | undefined {
  if (asset.source !== 'local') {
    return undefined;
  }
  const metadata = asset.resource.metadata;
  if (!metadata) {
    return undefined;
  }

  if (key === 'size') {
    return Number.isFinite(metadata.size) ? metadata.size : undefined;
  }
  return (key === 'created' ? metadata.createdAt : metadata.modifiedAt) ?? undefined;
}

/**
 * A sorted copy of `assets` (never mutates its input). Name orders by the
 * name shown (extension-free, locale-aware). File size, Created and Last
 * edited order by the file's own facts, largest / newest first for 'down'; an
 * asset with no such fact (a remote asset, or a part the platform didn't
 * report) always sorts last, whichever way the list is ordered, with the name
 * breaking ties. Any other key — one assets don't have — leaves the order
 * exactly as given, rather than inventing a comparison.
 */
export function sortAssets(assets: readonly Asset[], sort: AssetSort): Asset[] {
  const copy = [...assets];
  const byName = (a: Asset, b: Asset) =>
    getResourceDisplayName(a).localeCompare(getResourceDisplayName(b));
  const direction = sort.direction === 'down' ? 1 : -1;

  if (sort.key === 'name') {
    return copy.sort((a, b) => direction * byName(a, b));
  }
  if (sort.key !== 'size' && sort.key !== 'created' && sort.key !== 'updated') {
    return copy;
  }

  const key = sort.key;
  return copy.sort((a, b) => {
    const [x, y] = [factOf(a, key), factOf(b, key)];
    if (x === undefined && y === undefined) return byName(a, b);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    // 'down' = the larger value first (largest file, newest date); ISO dates compare as strings.
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return -direction * cmp || byName(a, b);
  });
}
