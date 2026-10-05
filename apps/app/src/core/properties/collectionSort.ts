/**
 * The ONE sorting engine for collection items. A sort is `{ property, direction }`; what it
 * means is the property's own `sort` behavior in the registry (`collectionProperties.ts`),
 * implemented once below. There is no per-domain sorter: a domain adapter fills each item's
 * `values` and this file orders whatever carries them — notes, folders and assets alike.
 *
 * `direction` names the arrow shown, not an abstract ordering ('down' | 'up'), because what
 * "down" means is the behavior's:
 *  - text: A→Z (plain `localeCompare` — deliberately NOT natural numeric order)
 *  - date: newest first
 *  - number: largest first
 *  - presence: items that have a value first
 *
 * Rules shared by every behavior but `presence`: an item with no value sorts LAST in either
 * direction (a blank text counts as no value), and the comparison never mutates its input.
 *
 * Ties keep their input order (a stable sort) unless the caller names the properties whose
 * ties are broken by Name (`nameTieBreak`). That option exists only because the notes and the
 * assets collections have always broken ties differently (notes: Description and Cover image;
 * assets: File size, Created and Last edited). It preserves that behavior verbatim; it is not
 * a rule of the engine, and a later product decision can make both lists equal or empty.
 */
import type { PropertyId, PropertyValues } from './collectionProperties';
import { COLLECTION_PROPERTIES } from './collectionProperties';

export type SortDirection = 'down' | 'up';

export interface CollectionSort {
  readonly property: PropertyId;
  readonly direction: SortDirection;
}

/** Anything the engine can order: an item that carries its raw property values. */
export interface SortableEntry {
  readonly values: PropertyValues;
}

export interface SortOptions {
  /** The properties whose equal (or both-missing) values are ordered by Name, A→Z, whichever the direction. */
  readonly nameTieBreak?: ReadonlySet<PropertyId>;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** `direction` applied to an ascending comparison. */
function directed(comparison: number, direction: SortDirection, descendingIsDown: boolean): number {
  // For text, "down" is ascending (A→Z); for date / number, "down" is descending (newest / largest first).
  return (direction === 'down') === descendingIsDown ? -comparison : comparison;
}

function compareText(x: unknown, y: unknown, direction: SortDirection): number {
  if (isBlank(x) && isBlank(y)) return 0;
  if (isBlank(x)) return 1;
  if (isBlank(y)) return -1;

  return directed((x as string).localeCompare(y as string), direction, false);
}

function compareOrdered(x: unknown, y: unknown, direction: SortDirection): number {
  if (isBlank(x) && isBlank(y)) return 0;
  if (isBlank(x)) return 1;
  if (isBlank(y)) return -1;

  const comparison = (x as string | number) < (y as string | number) ? -1 : (x as string | number) > (y as string | number) ? 1 : 0;
  return directed(comparison, direction, true);
}

function comparePresence(x: unknown, y: unknown, direction: SortDirection): number {
  const [hasX, hasY] = [!isBlank(x), !isBlank(y)];
  if (hasX === hasY) return 0;

  // "down": the one that has a value comes first; "up": it comes last.
  return directed(hasX ? -1 : 1, direction, false);
}

/**
 * A sorted copy of `items` by `sort`. A property with no sort behavior (not sortable) leaves
 * the order exactly as given rather than inventing a comparison.
 */
export function sortEntries<T extends SortableEntry>(
  items: readonly T[],
  sort: CollectionSort,
  { nameTieBreak }: SortOptions = {}
): T[] {
  const behavior = (COLLECTION_PROPERTIES[sort.property] as { readonly sort?: string }).sort;
  const copy = [...items];

  if (behavior === undefined) {
    return copy;
  }

  const compare =
    behavior === 'text' ? compareText : behavior === 'presence' ? comparePresence : compareOrdered;
  const breakTiesByName = nameTieBreak?.has(sort.property) === true;

  return copy.sort((a, b) => {
    const result = compare(a.values[sort.property], b.values[sort.property], sort.direction);

    if (result !== 0 || !breakTiesByName) {
      return result;
    }

    return (a.values.name ?? '').localeCompare(b.values.name ?? '');
  });
}
