// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Asset } from '@core/vault/models/Asset';
import { localAsset } from '@core/vault/testing/localAsset';
import { noteEntry } from '@features/collection/testing/collectionEntry';
import { noteVisible } from '@features/collection/testing/visibleProperties';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import { ASSETS_COLLECTION } from '@core/presentation/collection/collectionDefinitions';

import { AssetsCollectionBody } from './AssetsCollectionBody';
import { CollectionBody } from './CollectionBody';
import { CREATE_LABEL } from './collectionCreate';

/**
 * The collection's one Create affordance, in every layout and for every domain: a generic
 * "Create" row in List and Table, a generic "+" card in Card, calling whatever handler the page
 * bound. The domain decides what Create DOES; nothing here — or in the generic List/Table/Card —
 * knows whether a note or a file is made.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const LAYOUTS = ['list', 'table', 'card'] as const;

const photo = (): Asset =>
  localAsset({ id: 'img', kind: 'image', name: 'house.png', path: '/vault/Assets/house.png', parentId: 'assets' });

/** The affordance each layout draws, and the element a click goes to. */
const AFFORDANCE = {
  list: (c: HTMLElement) => c.querySelector<HTMLElement>('.collection-list > .collection-row--tone-action'),
  table: (c: HTMLElement) => c.querySelector<HTMLElement>('.collection-table-row--new-item'),
  card: (c: HTMLElement) => c.querySelector<HTMLElement>('.collection-grid > .collection-card--empty'),
};

describe('Create — notes (a note collection)', () => {
  it.each(LAYOUTS)('%s ends with a generic "Create" affordance that calls the bound handler', (layout) => {
    const onCreate = vi.fn();
    const { container } = render(
      <CollectionBody notes={[noteEntry()]} viewMode={layout} visible={noteVisible()} onCreate={onCreate} />
    );

    const affordance = AFFORDANCE[layout](container)!;
    expect(affordance, layout).not.toBeNull();
    expect(layout === 'card' ? affordance.getAttribute('aria-label') : affordance.textContent).toBe(CREATE_LABEL);

    fireEvent.click(affordance);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it.each(LAYOUTS)('%s offers no Create without a handler', (layout) => {
    const { container } = render(<CollectionBody notes={[noteEntry()]} viewMode={layout} visible={noteVisible()} />);

    expect(AFFORDANCE[layout](container), layout).toBeNull();
  });
});

describe('Create — assets', () => {
  it.each(LAYOUTS)('%s ends with the SAME generic "Create" affordance, calling the bound handler', (layout) => {
    const onCreate = vi.fn();
    const { container } = render(
      <AssetsCollectionBody
        assets={[photo()]}
        viewMode={layout}
        visible={resolveCollectionView(ASSETS_COLLECTION, { layout }).visible}
        resolveResourceUrl={(path) => `app://vault${path}`}
        onRenameResource={vi.fn()}
        onCreate={onCreate}
      />
    );

    const affordance = AFFORDANCE[layout](container)!;
    expect(affordance, layout).not.toBeNull();
    expect(layout === 'card' ? affordance.getAttribute('aria-label') : affordance.textContent).toBe(CREATE_LABEL);

    fireEvent.click(affordance);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('Create — a completely empty collection', () => {
  it.each(LAYOUTS)('notes, %s: the empty state replaces the layout, with no Create row or card', (layout) => {
    const { container, getByRole } = render(
      <CollectionBody notes={[]} viewMode={layout} visible={noteVisible()} onCreate={vi.fn()} />
    );

    expect(getByRole('status')).toBeInTheDocument();
    expect(AFFORDANCE[layout](container)).toBeNull();
    expect(container.querySelector('.collection-table, .collection-list')).toBeNull();
  });

  it.each(LAYOUTS)('assets, %s: the empty state replaces the layout, with no Create row or card', (layout) => {
    const { container, getByRole } = render(
      <AssetsCollectionBody
        assets={[]}
        viewMode={layout}
        resolveResourceUrl={(path) => path}
        onRenameResource={vi.fn()}
        onCreate={vi.fn()}
      />
    );

    expect(getByRole('status')).toBeInTheDocument();
    expect(AFFORDANCE[layout](container)).toBeNull();
  });

  it('a collection holding only folders is not empty: it keeps its layout and its Create', () => {
    const { queryByRole, getByText } = render(
      <CollectionBody
        folders={[{ ...noteEntry({ id: 'f', title: 'Folder' }), type: 'folder' }]}
        notes={[]}
        viewMode="table"
        visible={noteVisible()}
        onCreate={vi.fn()}
      />
    );

    expect(queryByRole('status')).toBeNull();
    expect(getByText(CREATE_LABEL)).toBeInTheDocument();
  });

  it('a notes section that is not drawn (Daily Notes root) with no folders is empty too', () => {
    const { getByRole } = render(<CollectionBody folders={[]} notes={[noteEntry()]} showNotes={false} />);

    expect(getByRole('status')).toBeInTheDocument();
  });
});
