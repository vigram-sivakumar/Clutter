import { describe, expect, it } from 'vitest';

import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import type { Folder } from '@core/vault/models/Folder';
import { PROPERTY_IDS, isSortableProperty } from '@core/properties/collectionProperties';

import {
  ALL_COLLECTION_DEFINITIONS,
  ARCHIVE_COLLECTION,
  ASSETS_COLLECTION,
  DAILY_NOTES_MONTH_COLLECTION,
  DAILY_NOTES_ROOT_COLLECTION,
  DAILY_NOTES_YEAR_COLLECTION,
  DEFAULT_REQUIRED,
  FAVORITES_COLLECTION,
  FOLDER_COLLECTION,
  INBOX_COLLECTION,
  TAG_COLLECTION,
  TEMPLATES_COLLECTION,
  WORKSPACE_COLLECTION,
  collectionDefinitionForFilteredView,
  collectionDefinitionForFolder,
} from './collectionDefinitions';
import { foldersOrderOf, showsFolders, showsNotes } from './collectionBehaviors';

describe('every CollectionDefinition holds the same invariants', () => {
  it.each(ALL_COLLECTION_DEFINITIONS.map((definition) => [definition.kind + (definition.behavior ? `/${definition.behavior}` : ''), definition] as const))(
    '%s',
    (_name, definition) => {
      // membership: real registry ids, listed once each
      expect(definition.properties.every((id) => PROPERTY_IDS.includes(id))).toBe(true);
      expect(new Set(definition.properties).size).toBe(definition.properties.length);

      // every collection offers Name — it is the always-present sort row and the row anchor
      expect(definition.properties).toContain('name');

      // defaultVisible is a SUBSET of the membership
      expect(definition.defaultVisible.every((id) => definition.properties.includes(id))).toBe(true);

      // the default sort is valid: offered, and sortable
      expect(definition.properties).toContain(definition.defaultSort.property);
      expect(isSortableProperty(definition.defaultSort.property)).toBe(true);
      expect(definition.defaultSort).toEqual({ property: 'name', direction: 'down' });

      // layouts
      expect(definition.layouts).toContain(definition.defaultLayout);

      // a required property is one the collection offers
      for (const required of Object.values(definition.required ?? DEFAULT_REQUIRED)) {
        expect(required.every((id) => definition.properties.includes(id))).toBe(true);
      }
    }
  );

  it('carries no function and no label: it is policy data, not a second property registry', () => {
    for (const definition of ALL_COLLECTION_DEFINITIONS) {
      expect(Object.values(definition).some((value) => typeof value === 'function')).toBe(false);
    }
  });
});

describe('membership — which global properties each collection offers (order is NOT part of it)', () => {
  const NOTE = ['name', 'description', 'cover', 'created', 'updated'];

  it('every note-shaped collection offers the note properties', () => {
    for (const definition of [FOLDER_COLLECTION, INBOX_COLLECTION, TEMPLATES_COLLECTION, WORKSPACE_COLLECTION, FAVORITES_COLLECTION, TAG_COLLECTION, DAILY_NOTES_ROOT_COLLECTION, DAILY_NOTES_YEAR_COLLECTION, DAILY_NOTES_MONTH_COLLECTION]) {
      expect([...definition.properties].sort(), definition.kind).toEqual([...NOTE].sort());
      expect([...definition.defaultVisible].sort(), definition.kind).toEqual([...NOTE].sort());
    }
  });

  it('the Archive offers only Name and the date it was archived (labelled "Delete") — no Description, Cover image, File size, Created or Last edited — and shows both by default', () => {
    expect([...ARCHIVE_COLLECTION.properties].sort()).toEqual(['archived', 'name']);
    expect([...ARCHIVE_COLLECTION.defaultVisible].sort()).toEqual(['archived', 'name']);
    for (const absent of ['cover', 'description', 'size', 'created', 'updated'] as const) {
      expect(ARCHIVE_COLLECTION.properties).not.toContain(absent);
    }
  });

  it('assets offer Name, File size, Created and Last edited — and start showing only the name', () => {
    expect([...ASSETS_COLLECTION.properties].sort()).toEqual(['created', 'name', 'size', 'updated']);
    expect(ASSETS_COLLECTION.defaultVisible).toEqual(['name']);
  });

  it('no note collection offers File size, and no asset collection offers Description, Cover image or Archived', () => {
    expect(FOLDER_COLLECTION.properties).not.toContain('size');
    for (const id of ['description', 'cover', 'archived'] as const) {
      expect(ASSETS_COLLECTION.properties).not.toContain(id);
    }
  });
});

describe('layouts and defaults', () => {
  it('every collection offers List, Table and Card — except the Archive, which offers List and Table only', () => {
    for (const definition of ALL_COLLECTION_DEFINITIONS) {
      expect([...definition.layouts], definition.kind).toEqual(definition.kind === 'archive' ? ['list', 'table'] : ['list', 'table', 'card']);
    }
  });

  it('notes default to Table and assets to Card', () => {
    for (const definition of ALL_COLLECTION_DEFINITIONS) {
      expect(definition.defaultLayout, definition.kind).toBe(definition.kind === 'assets' ? 'card' : 'table');
    }
  });
});

describe('required properties — Name is required everywhere except the Asset card', () => {
  it('the base rule requires Name in List, Table and Card', () => {
    expect(DEFAULT_REQUIRED).toEqual({ list: ['name'], table: ['name'], card: ['name'] });
  });

  it('every note-shaped collection uses the base rule (no override); the Archive states Name for its two layouts', () => {
    expect(ARCHIVE_COLLECTION.required).toEqual({ list: ['name'], table: ['name'] });
    for (const definition of ALL_COLLECTION_DEFINITIONS.filter((d) => d.kind !== 'assets' && d.kind !== 'archive')) {
      expect(definition.required, definition.kind).toBeUndefined();
    }
  });

  it('the Asset card is the one exception: List and Table require Name, Card requires nothing', () => {
    expect(ASSETS_COLLECTION.required).toEqual({ list: ['name'], table: ['name'], card: [] });
  });
});

describe('actions — what each collection can create (capability only; handlers are bound by the page)', () => {
  const actions = (definition: { actions: object }) => Object.keys(definition.actions).sort();

  it('pins the capabilities that used to be scattered conditionals in PageHost', () => {
    expect(actions(FOLDER_COLLECTION)).toEqual(['create', 'createFolder', 'fromTemplate']);
    expect(actions(WORKSPACE_COLLECTION)).toEqual(['create', 'createFolder', 'fromTemplate']);
    expect(actions(TEMPLATES_COLLECTION)).toEqual(['create', 'createFolder']);
    expect(actions(TAG_COLLECTION)).toEqual(['create']);
    // Inbox: a note can be made blank or from a template — and no folder can be made there.
    expect(actions(INBOX_COLLECTION)).toEqual(['create', 'fromTemplate']);
    expect(actions(ASSETS_COLLECTION)).toEqual(['create']);
  });

  it('the Archive, Favorites and every Daily Notes level create nothing from their own page', () => {
    for (const definition of [ARCHIVE_COLLECTION, FAVORITES_COLLECTION, DAILY_NOTES_ROOT_COLLECTION, DAILY_NOTES_YEAR_COLLECTION, DAILY_NOTES_MONTH_COLLECTION]) {
      expect(definition.actions.create, definition.kind).toBeUndefined();
      expect(definition.actions.createFolder, definition.kind).toBeUndefined();
    }
  });
});

describe('named behaviors — declarative identifiers; what they do lives in collectionBehaviors.ts', () => {
  it('only Inbox (notes only) and the Daily Notes root and a year carry one', () => {
    expect(ALL_COLLECTION_DEFINITIONS.filter((d) => d.behavior !== undefined).map((d) => d.behavior)).toEqual([
      'notes-only',
      'daily-notes-root',
      'daily-notes-year',
    ]);
  });

  it('a notes-only collection draws no folders section; every other still does', () => {
    expect(showsFolders('notes-only')).toBe(false);
    expect(showsFolders(undefined)).toBe(true);
    expect(showsFolders('daily-notes-root')).toBe(true);
    expect(showsNotes('notes-only')).toBe(true);
  });

  it('the root lists years latest first, a year lists its months January to December, and neither draws notes', () => {
    const years = ['2024', '2026', '2025'].sort(foldersOrderOf('daily-notes-root')!);
    const months = ['October', 'January', 'April'].sort(foldersOrderOf('daily-notes-year')!);

    expect(years).toEqual(['2026', '2025', '2024']);
    expect(months).toEqual(['January', 'April', 'October']);
    expect(showsNotes('daily-notes-root')).toBe(false);
    expect(showsNotes('daily-notes-year')).toBe(false);
  });

  it('every other collection (including a Daily Notes month) follows the Configure sort and draws its notes', () => {
    expect(foldersOrderOf(undefined)).toBeUndefined();
    expect(showsNotes(undefined)).toBe(true);
  });
});

describe('which definition a page is', () => {
  const folderBuilder = new FolderBuilder();
  const ROOT = '/vault';
  const folderAt = (path: string): Folder =>
    folderBuilder.build({ parentId: null, directory: { path, parentPath: null, frontmatter: null } });
  const reserved = { isSystemFolder: () => true } as unknown as MembershipSelector;
  const ordinary = { isSystemFolder: () => false } as unknown as MembershipSelector;

  it('reserved folders resolve to their own collection', () => {
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Archive`), ROOT, reserved)).toBe(ARCHIVE_COLLECTION);
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Inbox`), ROOT, reserved)).toBe(INBOX_COLLECTION);
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Templates`), ROOT, reserved)).toBe(TEMPLATES_COLLECTION);
  });

  it('an ordinary folder resolves to the folder collection', () => {
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Projects`), ROOT, ordinary)).toBe(FOLDER_COLLECTION);
  });

  it('Daily Notes levels are recognised by where they sit in the calendar tree, reserved or not', () => {
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Daily Notes`), ROOT, reserved)).toBe(DAILY_NOTES_ROOT_COLLECTION);
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Daily Notes/2026`), ROOT, ordinary)).toBe(DAILY_NOTES_YEAR_COLLECTION);
    expect(collectionDefinitionForFolder(folderAt(`${ROOT}/Daily Notes/2026/October`), ROOT, ordinary)).toBe(DAILY_NOTES_MONTH_COLLECTION);
  });

  it('filtered views resolve to their collection; the task views are not collections of this kind', () => {
    expect(collectionDefinitionForFilteredView({ kind: 'workspace' })).toBe(WORKSPACE_COLLECTION);
    expect(collectionDefinitionForFilteredView({ kind: 'favorites' })).toBe(FAVORITES_COLLECTION);
    expect(collectionDefinitionForFilteredView({ kind: 'tag', tagName: 'todo' })).toBe(TAG_COLLECTION);
    expect(collectionDefinitionForFilteredView({ kind: 'assets' })).toBe(ASSETS_COLLECTION);
    expect(collectionDefinitionForFilteredView({ kind: 'tasks-all' })).toBeUndefined();
  });
});
