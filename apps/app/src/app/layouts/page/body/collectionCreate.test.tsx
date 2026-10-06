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

  it('a collection holding only folders is not empty: it keeps its folders — and the empty notes section offers no Create', () => {
    const { queryByRole, getByText, queryByText } = render(
      <CollectionBody
        folders={[{ ...noteEntry({ id: 'f', title: 'Folder' }), type: 'folder' }]}
        notes={[]}
        viewMode="table"
        visible={noteVisible()}
        onCreate={vi.fn()}
        onCreateFolder={vi.fn()}
      />
    );

    expect(queryByRole('status')).toBeNull(); // not the whole-collection empty state
    expect(getByText('Folder')).toBeInTheDocument();
    expect(queryByText(CREATE_LABEL)).toBeNull(); // no notes → no notes Create
  });

  it('a completely empty collection offers the page\'s own call to action — here "Create note" — not the generic "Create"', () => {
    const onCreate = vi.fn();
    const { getByText, queryByText } = render(
      <CollectionBody notes={[]} viewMode="table" visible={noteVisible()} onCreate={onCreate} emptyCreateLabel="Create note" />
    );

    expect(queryByText(CREATE_LABEL)).toBeNull();
    fireEvent.click(getByText('Create note'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('assets: the empty state\'s action is the page\'s label ("Upload") and calls the same handler', () => {
    const onCreate = vi.fn();
    const { getByText } = render(
      <AssetsCollectionBody assets={[]} resolveResourceUrl={(path) => path} onRenameResource={vi.fn()} onCreate={onCreate} emptyCreateLabel="Upload" />
    );

    fireEvent.click(getByText('Upload'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('assets: the empty state\'s call to action carries the icon the page passes', () => {
    const { container } = render(
      <AssetsCollectionBody assets={[]} resolveResourceUrl={(path) => path} onRenameResource={vi.fn()} onCreate={vi.fn()} emptyCreateLabel="Upload" emptyCreateIcon="upload" />
    );

    expect(container.querySelector('.collection-empty-state button svg, .collection-empty-state button img')).not.toBeNull();
  });

  it('each section offers Create only once it has an item: folders get the create-folder card only when a folder exists', () => {
    const onCreateFolder = vi.fn();
    const none = render(
      <CollectionBody notes={[noteEntry()]} viewMode="table" visible={noteVisible()} onCreateFolder={onCreateFolder} />
    );
    expect(none.queryByLabelText('Create folder')).toBeNull();
    none.unmount();

    const some = render(
      <CollectionBody
        folders={[{ ...noteEntry({ id: 'f', title: 'Folder' }), type: 'folder' }]}
        notes={[noteEntry()]}
        viewMode="table"
        visible={noteVisible()}
        onCreateFolder={onCreateFolder}
      />
    );
    fireEvent.click(some.getByLabelText('Create folder'));
    expect(onCreateFolder).toHaveBeenCalledTimes(1);
  });

  it.each(LAYOUTS)('notes, %s: Create appears once there is a note, and not before', (layout) => {
    const withNote = render(<CollectionBody notes={[noteEntry()]} viewMode={layout} visible={noteVisible()} onCreate={vi.fn()} />);
    expect(AFFORDANCE[layout](withNote.container), layout).not.toBeNull();
    withNote.unmount();

    const folderOnly = render(
      <CollectionBody
        folders={[{ ...noteEntry({ id: 'f', title: 'Folder' }), type: 'folder' }]}
        notes={[]}
        viewMode={layout}
        visible={noteVisible()}
        onCreate={vi.fn()}
      />
    );
    expect(AFFORDANCE[layout](folderOnly.container), layout).toBeNull();
  });

  it('a notes section that is not drawn (Daily Notes root) with no folders is empty too', () => {
    const { getByRole } = render(<CollectionBody folders={[]} notes={[noteEntry()]} showNotes={false} />);

    expect(getByRole('status')).toBeInTheDocument();
  });
});
