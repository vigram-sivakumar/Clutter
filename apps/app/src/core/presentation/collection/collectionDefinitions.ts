/**
 * What each KIND of collection is, declared as data: which of the global properties it
 * offers, which are on by default, which layouts it supports, its default sort, which
 * actions it supports, and the few named behaviors that genuinely differ. A
 * `CollectionDefinition` is POLICY — a selection from the one property registry
 * (`core/properties/collectionProperties.ts`), never another copy of it: no labels, no
 * types, no sorting, no rendering.
 *
 * `properties` is MEMBERSHIP ONLY. Its array order means nothing; every consumer takes
 * property order from the registry (`resolveCollectionView` filters the registry's own
 * order by this membership).
 *
 * Capabilities are declared here and BOUND elsewhere: `actions` says a Workspace can create
 * a note, `PageHost` supplies what "create a note" does there.
 */
import type { Folder } from '@core/vault/models/Folder';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { FilteredView } from '@core/workspace/Workspace';
import type { PropertyId } from '@core/properties/collectionProperties';
import type { CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';

import { getSystemLocationForFolder } from '../systemPresentation';

export type CollectionKind =
  | 'folder'
  | 'inbox'
  | 'templates'
  | 'archive'
  | 'daily-notes'
  | 'workspace'
  | 'favorites'
  | 'tag'
  | 'assets';

/**
 * A named behavior a collection has that no other has. Declarative on purpose: the identifier
 * lives here, what it DOES (the folder ordering, hiding the notes) is implemented in
 * `collectionBehaviors.ts`. The Daily Notes root holds only years and a year only months —
 * made by the calendar, listed in calendar order, never with notes — while a month holds days.
 * `notes-only` is a collection that lists just its notes: no folders section.
 */
export type CollectionBehavior = 'daily-notes-root' | 'daily-notes-year' | 'notes-only';

/**
 * What a collection can create or offer — capability only; the handler is bound by the page.
 * `create` is the one generic "add an item to this collection" capability: what it DOES is the
 * domain's (a note collection makes a note, the assets collection opens the file picker and imports
 * what is chosen) and the generic collection components only ever see a handler labelled "Create".
 */
export interface CollectionActions {
  readonly create?: true;
  readonly createFolder?: true;
  /**
   * "From template" in the Add menu, next to New note (and New folder where it can be created).
   * Declared only where a note can be created from the page: it is an alternative way to make one.
   */
  readonly fromTemplate?: true;
}

export interface CollectionDefinition {
  readonly kind: CollectionKind;
  /** The global properties this collection offers — membership only, never an ordering. */
  readonly properties: readonly PropertyId[];
  /** The offered properties that are shown until the user says otherwise (a subset of `properties`). */
  readonly defaultVisible: readonly PropertyId[];
  readonly layouts: readonly CollectionLayout[];
  readonly defaultLayout: CollectionLayout;
  readonly defaultSort: CollectionSort;
  readonly actions: CollectionActions;
  readonly behavior?: CollectionBehavior;
  /**
   * Properties a layout always shows and the user cannot hide. Omitted, `DEFAULT_REQUIRED`
   * applies. A layout with no entry requires nothing.
   */
  readonly required?: Partial<Record<CollectionLayout, readonly PropertyId[]>>;
}

/** The base rule: the name anchors a row, a table row and a card. */
export const DEFAULT_REQUIRED: Readonly<Record<CollectionLayout, readonly PropertyId[]>> = {
  list: ['name'],
  table: ['name'],
  card: ['name'],
};

const ALL_LAYOUTS: readonly CollectionLayout[] = ['list', 'table', 'card'];
const DEFAULT_SORT: CollectionSort = { property: 'name', direction: 'down' };

/** What every note-shaped collection offers, all of it on by default. */
const NOTE_PROPERTIES: readonly PropertyId[] = ['name', 'description', 'cover', 'created', 'updated'];

const NOTE_COLLECTION = {
  properties: NOTE_PROPERTIES,
  defaultVisible: NOTE_PROPERTIES,
  layouts: ALL_LAYOUTS,
  defaultLayout: 'table',
  defaultSort: DEFAULT_SORT,
} as const satisfies Partial<CollectionDefinition>;

export const FOLDER_COLLECTION: CollectionDefinition = {
  ...NOTE_COLLECTION,
  kind: 'folder',
  actions: { create: true, createFolder: true, fromTemplate: true },
};

/** Reserved: nothing is created in it from its own page (as today). */
export const INBOX_COLLECTION: CollectionDefinition = {
  ...NOTE_COLLECTION,
  kind: 'inbox',
  actions: { create: true, fromTemplate: true },
  behavior: 'notes-only',
};

/** The template source: notes and folders can be created in it, and "From template" is not offered from it. */
export const TEMPLATES_COLLECTION: CollectionDefinition = {
  ...NOTE_COLLECTION,
  kind: 'templates',
  actions: { create: true, createFolder: true },
};

/**
 * One unified collection of everything archived — folders, notes and files, as rows of the generic
 * List or Table (there is no Card). It offers only Name and the date it was archived (labelled
 * "Delete"): when an item was created or last edited, or how big it is, is not what the Archive is for. A file has no archive date recorded, so
 * its cell for that is simply empty. The Type each row shows (Note, Folder, Image, PDF)
 * is the Archive's own presentation, not a property: it can't be toggled or sorted.
 */
export const ARCHIVE_COLLECTION: CollectionDefinition = {
  kind: 'archive',
  properties: ['name', 'archived'],
  defaultVisible: ['name', 'archived'],
  layouts: ['list', 'table'],
  defaultLayout: 'table',
  defaultSort: DEFAULT_SORT,
  actions: {},
  required: { list: ['name'], table: ['name'] },
};

/** The calendar makes these pages' contents; nothing is created by hand at any level. */
const DAILY_NOTES_BASE = { ...NOTE_COLLECTION, kind: 'daily-notes', actions: {} } as const;
export const DAILY_NOTES_ROOT_COLLECTION: CollectionDefinition = { ...DAILY_NOTES_BASE, behavior: 'daily-notes-root' };
export const DAILY_NOTES_YEAR_COLLECTION: CollectionDefinition = { ...DAILY_NOTES_BASE, behavior: 'daily-notes-year' };
export const DAILY_NOTES_MONTH_COLLECTION: CollectionDefinition = { ...DAILY_NOTES_BASE };

export const WORKSPACE_COLLECTION: CollectionDefinition = {
  ...NOTE_COLLECTION,
  kind: 'workspace',
  actions: { create: true, createFolder: true, fromTemplate: true },
};

/** A filter, not a container: nothing is created in it. */
export const FAVORITES_COLLECTION: CollectionDefinition = {
  ...NOTE_COLLECTION,
  kind: 'favorites',
  actions: {},
};

export const TAG_COLLECTION: CollectionDefinition = {
  ...NOTE_COLLECTION,
  kind: 'tag',
  actions: { create: true },
};

/**
 * Assets open as cards showing only their media and name; their file facts are opt-in. The
 * Asset card is the one layout where the name can be hidden — everywhere else it is required.
 */
export const ASSETS_COLLECTION: CollectionDefinition = {
  kind: 'assets',
  properties: ['name', 'size', 'created', 'updated'],
  defaultVisible: ['name'],
  layouts: ALL_LAYOUTS,
  defaultLayout: 'card',
  defaultSort: DEFAULT_SORT,
  actions: { create: true, createFolder: true },
  required: { list: ['name'], table: ['name'], card: [] },
};

/**
 * Which collection a folder page is: a Daily Notes level (decided by where it sits in the
 * calendar tree — years and months are ordinary-looking folders), a reserved folder, or an
 * ordinary one.
 */
export function collectionDefinitionForFolder(
  folder: Folder,
  vaultRoot: string,
  membershipSelector: MembershipSelector
): CollectionDefinition {
  const dailyNotesLevel = DailyNotePath.folderLevel(vaultRoot, folder.path);

  if (dailyNotesLevel === 'root') return DAILY_NOTES_ROOT_COLLECTION;
  if (dailyNotesLevel === 'year') return DAILY_NOTES_YEAR_COLLECTION;
  if (dailyNotesLevel === 'month') return DAILY_NOTES_MONTH_COLLECTION;

  // A folder inside Assets/ is part of the Assets collection: it opens as an Assets page.
  if (membershipSelector.isAssetsFolder(folder)) return ASSETS_COLLECTION;

  switch (getSystemLocationForFolder(folder, membershipSelector)) {
    case 'archive':
      return ARCHIVE_COLLECTION;
    case 'inbox':
      return INBOX_COLLECTION;
    case 'templates':
      return TEMPLATES_COLLECTION;
    default:
      return FOLDER_COLLECTION;
  }
}

/** Which collection a filtered view is — `undefined` for the task views, which are not collections of this kind. */
export function collectionDefinitionForFilteredView(view: FilteredView): CollectionDefinition | undefined {
  switch (view.kind) {
    case 'workspace':
      return WORKSPACE_COLLECTION;
    case 'favorites':
      return FAVORITES_COLLECTION;
    case 'tag':
      return TAG_COLLECTION;
    case 'assets':
      return ASSETS_COLLECTION;
    default:
      return undefined;
  }
}

/** Every definition, for tests that hold each to the same invariants. */
export const ALL_COLLECTION_DEFINITIONS: readonly CollectionDefinition[] = [
  FOLDER_COLLECTION,
  INBOX_COLLECTION,
  TEMPLATES_COLLECTION,
  ARCHIVE_COLLECTION,
  DAILY_NOTES_ROOT_COLLECTION,
  DAILY_NOTES_YEAR_COLLECTION,
  DAILY_NOTES_MONTH_COLLECTION,
  WORKSPACE_COLLECTION,
  FAVORITES_COLLECTION,
  TAG_COLLECTION,
  ASSETS_COLLECTION,
];
