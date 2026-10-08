/**
 * What a user has chosen for one collection — USER INTENT ONLY, never a copy of what the
 * collection is capable of or defaults to. A dependency-free leaf (it imports only the
 * registry's ids), shared by the persistence store, the resolver and the UI.
 *
 *   undefined          → no opinion: the collection's own default applies
 *   propertyOverrides  → `true` explicitly shows a property, `false` explicitly hides it;
 *                        a property the user returned to its default has NO entry. These are the
 *                        Table's choices.
 *   listPropertyOverrides → the same, for the List layout only. The List has its own visible
 *                        properties: it never inherits the Table's, and customizing one never
 *                        touches the other (both resolve against the same property registry)
 *   layoutPropertyOverrides → the same, for every OTHER layout (the Card, and any layout added later),
 *                        keyed by layout: each layout keeps its own and shares nothing with another
 *   sort               → the property to order by and the arrow direction
 *   sidebarSort        → the same, for the folder's own listing in the notes sidebar — chosen
 *                        independently of `sort` (the collection page's order)
 *
 * Nothing here is persisted that a `CollectionDefinition` already knows (which properties
 * exist, which are on by default, which layouts, which sorts are valid).
 */
import type { PropertyId } from './collectionProperties';
import type { CollectionSort } from './collectionSort';
import type { SidebarSort } from './sidebarSort';

export type CollectionLayout = 'list' | 'table' | 'card';

/** The layouts in the order the Configure menu lists them. */
export const COLLECTION_LAYOUTS: readonly CollectionLayout[] = ['list', 'table', 'card'];

export function isCollectionLayout(value: unknown): value is CollectionLayout {
  return value === 'list' || value === 'table' || value === 'card';
}

export type PropertyOverrides = Partial<Record<PropertyId, boolean>>;

export interface CollectionViewConfig {
  readonly layout?: CollectionLayout;
  readonly propertyOverrides?: PropertyOverrides;
  /** The List layout's own overrides — see the module comment. Absent: the List shows its layout default. */
  readonly listPropertyOverrides?: PropertyOverrides;
  /** Every other layout's own overrides, by layout — see the module comment. */
  readonly layoutPropertyOverrides?: Partial<Record<CollectionLayout, PropertyOverrides>>;
  readonly sort?: CollectionSort;
  /** How the notes sidebar orders this folder's children; absent means the sidebar's default order. */
  readonly sidebarSort?: SidebarSort;
}

/**
 * The retired persisted shape for a collection's properties: a full snapshot of eight
 * booleans (plus the dead `preview`), keyed by what used to be the UI's own property names.
 * Only ever READ — to be converted into `propertyOverrides` against the collection's
 * definition (see `migrateLegacyProperties`) — and never written for a collection the user
 * touches again. Optional keys are the ones older entries lack.
 */
export interface LegacyCollectionProperties {
  readonly description: boolean;
  readonly created: boolean;
  readonly updated: boolean;
  readonly archived?: boolean;
  readonly cover?: boolean;
  readonly preview?: boolean;
  readonly title?: boolean;
  readonly size?: boolean;
}

/**
 * A stored entry: the intent shape, plus the legacy snapshot an entry written before the
 * migration still carries until its collection is next changed.
 */
export interface PersistedCollectionViewConfig extends CollectionViewConfig {
  readonly legacyProperties?: LegacyCollectionProperties;
}
