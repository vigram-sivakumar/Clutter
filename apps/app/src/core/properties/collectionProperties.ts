/**
 * The global Collection Property registry — the ONE place a collection property is
 * defined. A collection property is a piece of information an item in a collection
 * (a note, a folder, an asset) can expose: its Name, Description, Cover image, File size,
 * Created, Last edited and Archived date.
 *
 * Not to be confused with a note's own frontmatter Properties (`systemProperties.ts`,
 * ADR-036): those are the Properties list on a note's page. A collection property reuses
 * that registry's labels where they are the same fact (Created, Last edited) and nothing else.
 *
 * What this file owns — and ONLY this:
 *  - each property's id (the object key, also what is persisted);
 *  - the canonical order of properties: the DECLARATION ORDER of `COLLECTION_PROPERTIES`
 *    below. There is no second ordering list anywhere — the Configure menu, a table's
 *    columns, a card's metadata lines and the Sort by list all take their order from here;
 *  - the user-facing label;
 *  - the semantic `type` (what kind of value it holds);
 *  - the `sort` behavior (how the property is ordered, if it can be). A property with no
 *    `sort` is not sortable, and a Sort by list is simply the sortable subset.
 *
 * What it must never own: which collections offer a property (that is a
 * `CollectionDefinition`'s explicit selection of ids), which layouts show it, how it is
 * drawn (widths, slots, renderers, CSS), or anything about the Note / Folder / Asset
 * models. It imports none of them — a domain adapter fills `PropertyValues` and this
 * file never sees where a value came from.
 */
import { systemPropertyLabel } from './systemProperties';

/** What kind of value a collection property holds. */
export type CollectionPropertyType = 'text' | 'date' | 'day' | 'number' | 'media';

/**
 * How a property is ordered — see `collectionSort.ts` for each behavior's exact rule.
 *  - `text`: plain `localeCompare`; "down" is A→Z.
 *  - `date`: ISO instants; "down" is newest first (also used by `day`, whose ISO calendar days order the same way).
 *  - `number`: "down" is largest first.
 *  - `presence`: whether the item has a value at all (a cover); "down" is has-a-value first.
 */
export type CollectionSortBehavior = 'text' | 'date' | 'number' | 'presence';

export interface CollectionPropertyDefinition {
  /** What the property is called wherever it is shown. */
  readonly label: string;
  readonly type: CollectionPropertyType;
  /** Absent: the property cannot be sorted by. */
  readonly sort?: CollectionSortBehavior;
}

/**
 * THE registry. The declaration order below IS the canonical property order — change it
 * here and every menu, table and card follows. (`size` sits before the dates so a
 * collection that offers it — assets — lists File size, Created, Last edited, as it
 * always has.)
 */
export const COLLECTION_PROPERTIES = {
  name: { label: 'Name', type: 'text', sort: 'text' },
  description: { label: 'Description', type: 'text', sort: 'text' },
  cover: { label: 'Cover image', type: 'media', sort: 'presence' },
  size: { label: 'File size', type: 'number', sort: 'number' },
  created: { label: systemPropertyLabel('created'), type: 'date', sort: 'date' },
  updated: { label: systemPropertyLabel('modified'), type: 'date', sort: 'date' },
  archived: { label: 'Delete', type: 'date', sort: 'date' },
  // A task's own properties: its explicit due date (a calendar day, not an instant) and its
  // source — the note it lives in.
  dueDate: { label: 'Due date', type: 'day', sort: 'date' },
  source: { label: 'Source', type: 'text', sort: 'text' },
} as const satisfies Record<string, CollectionPropertyDefinition>;

export type PropertyId = keyof typeof COLLECTION_PROPERTIES;

/** Every property id in canonical order — derived from the declaration above, never maintained by hand. */
export const PROPERTY_IDS = Object.keys(COLLECTION_PROPERTIES) as readonly PropertyId[];

export function isPropertyId(value: unknown): value is PropertyId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(COLLECTION_PROPERTIES, value);
}

export function propertyDefinition(id: PropertyId): CollectionPropertyDefinition {
  return COLLECTION_PROPERTIES[id];
}

export function propertyLabel(id: PropertyId): string {
  return COLLECTION_PROPERTIES[id].label;
}

/** Whether a Sort by can order by this property. */
export function isSortableProperty(id: PropertyId): boolean {
  return (COLLECTION_PROPERTIES[id] as CollectionPropertyDefinition).sort !== undefined;
}

/**
 * The raw (never display-formatted) value each type holds: text → string, date → an ISO
 * instant, day → an ISO calendar day (`YYYY-MM-DD`), number → a number, media → the reference to the media (a cover reference).
 */
type ValueOfType = { text: string; date: string; day: string; number: number; media: string };

/**
 * One item's raw property values. A key is ABSENT when the item has no such value — a
 * folder has no dates, a remote asset has no file size, a note with a hidden cover has no
 * cover. Absent is a first-class state: sorting puts it last and layouts draw nothing.
 * Filled once per item by a domain adapter; the registry never reads a domain object.
 */
export type PropertyValues = {
  readonly [K in PropertyId]?: ValueOfType[(typeof COLLECTION_PROPERTIES)[K]['type']];
};
