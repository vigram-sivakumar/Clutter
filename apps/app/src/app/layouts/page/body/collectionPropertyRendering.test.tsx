// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PropertyId } from '@core/properties/collectionProperties';
import {
  ARCHIVE_COLLECTION,
  FOLDER_COLLECTION,
  type CollectionDefinition,
} from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import { noteEntry } from '@features/collection/testing/collectionEntry';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import { CollectionBody } from './CollectionBody';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(cleanup);

/**
 * Audit: every property a collection OFFERS is actually drawn by its List and by its Table when it is
 * visible, and by neither when it is not. Description is drawn as the line under the title (the entry's
 * description slot — the Table's Name cell and the List's entry), every other value property as a
 * `CollectionEntryProperties` value. A property that is offered but never drawn — or drawn while hidden —
 * fails here, which is how a property lost in a migration is found.
 */
const NOTE = noteEntry({
  title: 'Plan',
  description: 'About the plan',
  created: '2026-08-10T09:03:00.000Z',
  updated: '2026-08-12T14:20:00.000Z',
  archived: '2026-08-13T10:00:00.000Z',
});

const MARKERS: Partial<Record<PropertyId, (root: HTMLElement) => boolean>> = {
  description: (root) => root.querySelector('.collection-entry__description')?.textContent === 'About the plan',
  created: (root) => root.querySelector('.collection-table-row__created, .collection-entry-properties') !== null && /\d/.test(root.textContent ?? ''),
  type: (root) => [...root.querySelectorAll('.collection-entry-properties')].some((el) => el.textContent === 'Note'),
  archived: (root) => /\d/.test(root.textContent ?? ''),
};

function renderBody(definition: CollectionDefinition, layout: CollectionLayout, visible: readonly PropertyId[]) {
  return definition.kind === 'archive'
    ? render(<ArchiveCollectionBody notes={[NOTE]} resources={[]} viewMode={layout} visible={visible} />)
    : render(<CollectionBody notes={[NOTE]} viewMode={layout} visible={visible} />);
}

describe.each([FOLDER_COLLECTION, ARCHIVE_COLLECTION])('$kind: every offered, drawable property appears in List and Table', (definition) => {
  for (const layout of ['list', 'table'] as const) {
    const offered = resolveCollectionView(definition, { layout }).available.filter((id) => id !== 'name' && id in MARKERS && id !== 'cover');

    it.each(offered)(`${layout}: %s is drawn when visible and absent when hidden`, (id) => {
      const shown = renderBody(definition, layout, ['name', id]);
      expect(MARKERS[id]!(shown.container), `${id} visible`).toBe(true);
      cleanup();

      const hidden = renderBody(definition, layout, ['name']);
      expect(hidden.container.querySelector('.collection-entry__description')).toBeNull();
      expect(hidden.container.querySelector('.collection-entry-properties')).toBeNull();
    });
  }
});

describe('Description is configured per view', () => {
  it('on in the List does not turn it on in the Table, and the other way round', () => {
    const listOnly = { listPropertyOverrides: { description: true } };
    const tableOnly = { propertyOverrides: { description: false } };

    expect(resolveCollectionView(FOLDER_COLLECTION, { ...listOnly, layout: 'list' }).visible).toContain('description');
    expect(resolveCollectionView(FOLDER_COLLECTION, { ...listOnly, layout: 'table' }).visible).toContain('description');
    expect(resolveCollectionView(FOLDER_COLLECTION, { ...tableOnly, layout: 'table' }).visible).not.toContain('description');
    expect(resolveCollectionView(FOLDER_COLLECTION, { ...tableOnly, layout: 'list' }).visible).not.toContain('description');
    // Table's own default keeps Description on; the List's own default leaves it off.
    expect(resolveCollectionView(FOLDER_COLLECTION, { ...tableOnly, layout: 'list' }).visible).toEqual(['name']);
  });

  it('a note collection offers Description in every layout; the Archive in List and Table (it has no Card), off by default', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      expect(resolveCollectionView(FOLDER_COLLECTION, { layout }).available).toContain('description');
    }
    for (const layout of ['list', 'table'] as const) {
      const view = resolveCollectionView(ARCHIVE_COLLECTION, { layout });
      expect(view.available).toContain('description');
      expect(view.visible).not.toContain('description');
    }
    expect(ARCHIVE_COLLECTION.layouts).toEqual(['list', 'table']);
  });
});
