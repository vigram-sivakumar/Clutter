import {
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  type CollectionPropertyVisibility,
  type CollectionSortKey,
  type CollectionViewMode,
} from './CollectionBody';

/**
 * What a collection's Configure menu offers — the one place a collection type
 * declares which standard controls apply to it, instead of each collection
 * hand-assembling its own header. The menu, the persisted-layout fallback and
 * the header actions all read this; nothing about a specific collection type
 * lives in the menu itself.
 */
export interface CollectionViewCapabilities {
  /** The layouts this collection can be shown in, in menu order. */
  readonly layouts: readonly CollectionViewMode[];
  /** The layout used when none is persisted (or the persisted one isn't supported here). */
  readonly defaultLayout: CollectionViewMode;
  /** Whether the Properties configuration (which fields a row/card shows) is offered. */
  readonly properties: boolean;
  /**
   * The Properties this collection offers, in every layout it has — only those
   * (`'title'` is only ever shown in the Card layout, where the name is a
   * property; List and Table always show it). Absent, the note-shaped list
   * applies (Description, dates, List/Table's Cover image); `'title'` and
   * `'size'` are only ever offered by a collection that lists them here.
   */
  readonly propertyKeys?: readonly (keyof CollectionPropertyVisibility)[];
  /**
   * Property visibilities that differ from the app-wide defaults when nothing
   * is persisted yet for this collection (a first-time user). Once the user
   * toggles anything, the whole set is persisted and wins.
   */
  readonly defaultProperties?: Partial<CollectionPropertyVisibility>;
  /**
   * The keys Sort by offers, in menu order — empty means no Sort by at all.
   * (`'archived'` is listed for notes but only ever shown in the Archive
   * collection, which the menu gates separately.)
   */
  readonly sortKeys: readonly CollectionSortKey[];
}

/** Folders, Workspace, Favorites, Tags, Archive — note-shaped collections: every layout, properties and sort. */
export const NOTE_COLLECTION_VIEW_CAPABILITIES: CollectionViewCapabilities = {
  layouts: ['list', 'table', 'card'],
  defaultLayout: 'table',
  properties: true,
  sortKeys: ['name', 'description', 'cover', 'created', 'updated', 'archived'],
};

/**
 * Assets: the same three layouts notes have (List, Table, Card), opening in
 * Card for anyone who hasn't chosen otherwise (a collection's first-time
 * default; once a layout is picked it is persisted and wins). Properties offers
 * Title (Card only), File size, Created and Last edited — in every layout: the
 * card's metadata lines, the list's metadata and the table's columns. Sort by
 * offers exactly those (plus Name): File size, Created and Last edited.
 */
export const ASSET_COLLECTION_VIEW_CAPABILITIES: CollectionViewCapabilities = {
  layouts: ['list', 'table', 'card'],
  defaultLayout: 'card',
  properties: true,
  propertyKeys: ['title', 'size', 'created', 'updated'],
  // A first-time view shows just the media/name and the kind; the file facts are opt-in, in every layout.
  defaultProperties: { size: false, created: false, updated: false },
  sortKeys: ['name', 'size', 'created', 'updated'],
};

/** The properties a collection starts with before the user has toggled any: the app-wide defaults, then the collection's own. */
export function resolveDefaultProperties(
  capabilities: CollectionViewCapabilities
): CollectionPropertyVisibility {
  return { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, ...capabilities.defaultProperties };
}

/** A persisted layout, if this collection still supports it; otherwise the collection's default. */
export function resolveSupportedLayout(
  layout: CollectionViewMode | undefined,
  capabilities: CollectionViewCapabilities
): CollectionViewMode {
  return layout !== undefined && capabilities.layouts.includes(layout)
    ? layout
    : capabilities.defaultLayout;
}

/** A persisted sort, if this collection offers its key; otherwise `fallback` (the app default). */
export function resolveSupportedSort<T extends { key: CollectionSortKey }>(
  sort: T | undefined,
  capabilities: CollectionViewCapabilities,
  fallback: T
): T {
  return sort !== undefined && capabilities.sortKeys.includes(sort.key) ? sort : fallback;
}
