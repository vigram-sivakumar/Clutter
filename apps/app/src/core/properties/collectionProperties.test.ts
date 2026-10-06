import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  COLLECTION_PROPERTIES,
  PROPERTY_IDS,
  isPropertyId,
  isSortableProperty,
  propertyLabel,
  type PropertyId,
} from './collectionProperties';

describe('the collection property registry', () => {
  it('pins the canonical order: name, description, cover, size, created, updated, archived, dueDate, source', () => {
    // This order is what the Configure menu, a table's columns, a card's metadata lines and the
    // Sort by list all follow. Changing it is a product change, not a refactor — hence the pin.
    expect(PROPERTY_IDS).toEqual(['name', 'description', 'cover', 'size', 'created', 'updated', 'archived', 'dueDate', 'source']);
  });

  it('derives the id list from the registry itself — one declaration, no second ordering', () => {
    expect(PROPERTY_IDS).toEqual(Object.keys(COLLECTION_PROPERTIES));
  });

  it('keeps `updated` as the id of "Last edited" (it is the persisted key; it is not renamed to `modified`)', () => {
    expect(PROPERTY_IDS).toContain('updated');
    expect(PROPERTY_IDS).not.toContain('modified');
  });

  it('preserves every user-facing label', () => {
    expect(Object.fromEntries(PROPERTY_IDS.map((id) => [id, propertyLabel(id)]))).toEqual({
      name: 'Name',
      description: 'Description',
      cover: 'Cover image',
      size: 'File size',
      created: 'Created',
      updated: 'Last edited',
      archived: 'Delete',
      dueDate: 'Due date',
      source: 'Source',
    });
  });

  it('gives each property a semantic type', () => {
    expect(Object.fromEntries(PROPERTY_IDS.map((id) => [id, COLLECTION_PROPERTIES[id].type]))).toEqual({
      name: 'text',
      description: 'text',
      cover: 'media',
      size: 'number',
      created: 'date',
      updated: 'date',
      archived: 'date',
      // a calendar day, not an instant — formatted as a day, ordered like a date
      dueDate: 'day',
      source: 'text',
    });
  });

  it('gives each property its sort behavior — and cover sorts by presence, as it does today', () => {
    expect(Object.fromEntries(PROPERTY_IDS.map((id) => [id, COLLECTION_PROPERTIES[id].sort]))).toEqual({
      name: 'text',
      description: 'text',
      cover: 'presence',
      size: 'number',
      created: 'date',
      updated: 'date',
      archived: 'date',
      dueDate: 'date',
      source: 'text',
    });
  });

  it('whether a property is sortable is read from the property itself', () => {
    for (const id of PROPERTY_IDS) {
      expect(isSortableProperty(id), id).toBe(COLLECTION_PROPERTIES[id].sort !== undefined);
    }
  });

  it('recognizes exactly the registered ids', () => {
    for (const id of PROPERTY_IDS) {
      expect(isPropertyId(id)).toBe(true);
    }
    for (const notAnId of ['modified', 'title', 'preview', 'type', 'lastOpened', '', 'toString', 'constructor', 5, null, undefined]) {
      expect(isPropertyId(notAnId), String(notAnId)).toBe(false);
    }
  });

  it('the type of an id is the registry key (compile-time: PropertyId is derived, not declared again)', () => {
    const ids: PropertyId[] = [...PROPERTY_IDS];
    expect(ids).toHaveLength(9);
  });
});

describe('the registry stays a dependency-free leaf that owns no domain, layout or rendering knowledge', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'collectionProperties.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const imports = [...code.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((match) => match[1]);

  it('imports only the system-property labels', () => {
    expect(imports).toEqual(['./systemProperties']);
  });

  it('carries no widths, slots, renderers or CSS', () => {
    expect(code).not.toMatch(/width|slot|render|className|css|react/i);
  });
});
