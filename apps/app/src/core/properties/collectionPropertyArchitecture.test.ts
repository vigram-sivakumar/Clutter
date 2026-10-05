import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PROPERTY_IDS, isSortableProperty } from './collectionProperties';
import { ALL_COLLECTION_DEFINITIONS } from '../presentation/collection/collectionDefinitions';

/**
 * Architecture guards for the collection property system, checked against the source itself.
 * The point of the registry is ONE definition of each property and ONE sort capability; these
 * fail the day a second list, a second sort-key union or a per-domain sorter creeps back in.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function filesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesOf(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const PRODUCTION = filesOf(SRC).map((path) => ({ rel: relative(SRC, path), text: strip(readFileSync(path, 'utf8')) }));

describe('the old, duplicated property and sort lists never come back', () => {
  const RETIRED = [
    'SORT_KEY_OF_PROPERTY',
    'VALID_SORT_KEYS',
    'CollectionSortKey',
    'CollectionSortState',
    'PersistedCollectionSortKey',
    'AssetSortKey',
    'sortCollectionEntries',
    'sortAssets',
    'DATE_PROPERTY_ITEMS',
    'CollectionPropertyVisibility',
    'DEFAULT_COLLECTION_PROPERTY_VISIBILITY',
    'NoteTableColumnVisibility',
    'AssetTableColumnVisibility',
    'collectionFieldLabel',
    'NOTE_COLLECTION_VIEW_CAPABILITIES',
    'ASSET_COLLECTION_VIEW_CAPABILITIES',
  ];

  it.each(RETIRED)('%s exists nowhere in production code', (name) => {
    const found = PRODUCTION.filter((file) => file.text.includes(name)).map((file) => file.rel);

    expect(found).toEqual([]);
  });
});

describe('the registry is the only declaration of a property id', () => {
  it('no production file declares its own union of the property ids', () => {
    const ids = PROPERTY_IDS.map((id) => `'${id}'`);
    const offenders = PRODUCTION.filter((file) => {
      if (file.rel === 'core/properties/collectionProperties.ts') return false;
      // A type alias / union spelling out most of the registry is a second declaration.
      return /type\s+\w+\s*=\s*(?:\|\s*)?'[a-z]+'(?:\s*\|\s*'[a-z]+'){4,}/.test(file.text) && ids.filter((id) => file.text.includes(id)).length >= 5;
    }).map((file) => file.rel);

    expect(offenders).toEqual([]);
  });

  it('only the registry and the sort engine read a property\'s `sort` behavior', () => {
    const readers = PRODUCTION.filter((file) => /COLLECTION_PROPERTIES\[[^\]]+\][^;]*\.sort\b/.test(file.text)).map((file) => file.rel);

    expect(readers.sort()).toEqual(['core/properties/collectionProperties.ts', 'core/properties/collectionSort.ts']);
  });

  it('there is one sorting engine: sortEntries, used by the notes, the Archive and the assets bodies', () => {
    const users = PRODUCTION.filter((file) => /\bsortEntries\b\s*[<(]/.test(file.text)).map((file) => file.rel).sort();

    expect(users).toEqual([
      'app/layouts/page/body/ArchiveCollectionBody.tsx',
      'app/layouts/page/body/AssetsCollectionBody.tsx',
      'app/layouts/page/body/CollectionBody.tsx',
      'core/properties/collectionSort.ts',
    ]);
  });
});

describe('Properties and Sort by cannot disagree', () => {
  it('every definition\'s membership, default-visible set and default sort are drawn from the registry — and the default sort is sortable', () => {
    for (const definition of ALL_COLLECTION_DEFINITIONS) {
      expect(definition.properties.every((id) => PROPERTY_IDS.includes(id)), definition.kind).toBe(true);
      expect(isSortableProperty(definition.defaultSort.property), definition.kind).toBe(true);
    }
  });

  it('a definition\'s properties array is never read for ORDER outside the resolver (order is the registry\'s)', () => {
    const readers = PRODUCTION.filter((file) => /definition\.properties\b/.test(file.text)).map((file) => file.rel).sort();

    expect(readers).toEqual(['core/presentation/collection/resolveCollectionView.ts']);
  });
});

describe('the layouts consume the resolved visible properties, never a property list of their own', () => {
  it('no layout mapper lists the registry\'s plain-value properties by hand', () => {
    // (The asset adapter, `toAssetEntry`, names the properties whose ties break by Name — collection policy, not a layout.)
    const mappers = PRODUCTION.filter((file) => /features\/collection\/components\/(note|asset|folder)\/(to(Note|Asset|Folder)(List|Table|Card)|assetCardMetadata)/.test(file.rel));
    const offenders = mappers.filter((file) => /['"]created['"][\s\S]{0,60}['"]updated['"]/.test(file.text)).map((file) => file.rel);

    expect(offenders).toEqual([]);
  });
});
