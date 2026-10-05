// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssetsCollectionBody } from './AssetsCollectionBody';
import { DEFAULT_COLLECTION_PROPERTY_VISIBILITY, type CollectionViewMode } from './CollectionBody';
import type { Asset, RemoteAsset } from '@core/vault/models/Asset';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { localAsset } from '@core/vault/testing/localAsset';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const resolveResourceUrl = (path: string) => `app://vault${path.replace('/vault', '')}`;

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'house.png',
    path: '/vault/Assets/house.png',
    parentId: 'assets-folder',
    ...overrides,
  };
}

function renderAssets(
  props: Partial<Omit<Parameters<typeof AssetsCollectionBody>[0], 'assets' | 'onOpenAsset'>> & {
    /** Vault files, listed as local assets (the common case). */
    resources?: VaultResource[];
    assets?: Asset[];
    onOpenResource?: (resource: VaultResource) => void;
    onOpenAsset?: (asset: Asset) => void;
  }
) {
  const { resources = [], assets, onOpenResource, onOpenAsset, ...rest } = props;

  return render(
    <AssetsCollectionBody
      onRenameResource={vi.fn()}
      resolveResourceUrl={resolveResourceUrl}
      {...rest}
      assets={assets ?? resources.map((resource) => localAsset(resource))}
      onOpenAsset={
        onOpenAsset ??
        (onOpenResource ? (asset) => asset.source === 'local' && onOpenResource(asset.resource) : undefined)
      }
    />
  );
}

/** The item element for each layout — the shared layer's own row/card class. */
const ITEM_SELECTOR: Record<CollectionViewMode, string> = {
  list: '.collection-row',
  table: '.collection-table-row',
  card: '.collection-card--layout-overlay',
};
const LAYOUTS: CollectionViewMode[] = ['list', 'table', 'card'];

const itemFor = (container: HTMLElement, viewMode: CollectionViewMode, index = 0) =>
  container.querySelectorAll<HTMLElement>(ITEM_SELECTOR[viewMode])[index]!;

describe.each(LAYOUTS)('AssetsCollectionBody — %s layout', (viewMode) => {
  it('renders one item per resource it is given, nothing filtered or added', () => {
    const resources = [
      makeResource({ id: 'house', name: 'house.png', kind: 'image' }),
      makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' }),
      makeResource({ id: 'floorplan', name: 'floorplan.png', kind: 'image', parentId: null }),
    ];

    const { container } = renderAssets({ resources, viewMode });

    expect(container.querySelectorAll(ITEM_SELECTOR[viewMode])).toHaveLength(3);
    expect(screen.getByText('house')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByText('floorplan')).toBeInTheDocument();
  });

  it('renders correctly with an empty collection', () => {
    const { container } = renderAssets({ resources: [], viewMode });

    expect(container.querySelectorAll(ITEM_SELECTOR[viewMode])).toHaveLength(0);
  });

  it('labels each item by kind in List and Table (the card has no type label — its preview shows the kind)', () => {
    const { container } = renderAssets({
      resources: [
        makeResource({ id: 'house', name: 'house.png', kind: 'image' }),
        makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' }),
      ],
      viewMode,
    });

    if (viewMode === 'card') {
      expect(container.querySelector('.card-title-section__metadata')).toBeNull();
      expect(screen.queryByText('Image')).toBeNull();
      expect(screen.queryByText('PDF')).toBeNull();
      return;
    }
    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('distinguishes image and pdf items by icon', () => {
    const { container } = renderAssets({
      resources: [
        makeResource({ id: 'house', name: 'house.png', kind: 'image' }),
        makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' }),
      ],
      viewMode,
    });

    const icon = (index: number) =>
      itemFor(container, viewMode, index).querySelector('.collection-row__leading svg, .card-title-section__leading svg')?.outerHTML;
    expect(icon(0)).toBeTruthy();
    expect(icon(1)).toBeTruthy();
    expect(icon(0)).not.toBe(icon(1));
  });

  it('clicking an image invokes onOpenResource with the resource — the existing image overlay', () => {
    const onOpenResource = vi.fn();
    const resource = makeResource({ id: 'house', name: 'house.png', kind: 'image' });
    const { container } = renderAssets({ resources: [resource], viewMode, onOpenResource });

    fireEvent.click(itemFor(container, viewMode));

    expect(onOpenResource).toHaveBeenCalledWith(resource);
  });

  it('clicking a pdf invokes onOpenResource with the resource — the existing PDF viewer', () => {
    const onOpenResource = vi.fn();
    const resource = makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf' });
    const { container } = renderAssets({ resources: [resource], viewMode, onOpenResource });

    fireEvent.click(itemFor(container, viewMode));

    expect(onOpenResource).toHaveBeenCalledWith(resource);
  });

  it('has no three-dot / actions menu on its items, and adds no header controls of its own', () => {
    const { container } = renderAssets({
      resources: [makeResource(), makeResource({ id: 'r2', name: 'b.pdf', kind: 'pdf' })],
      viewMode,
    });

    expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Add asset"], button[aria-label="New"]')).toBeNull();
  });

  describe('rename (F2 on a focused item)', () => {
    const startRename = (container: HTMLElement) => {
      const item = itemFor(container, viewMode);
      item.focus();
      fireEvent.keyDown(item, { key: 'F2' });
    };

    it('F2 turns the name into an inline editor seeded with the extension-free name', () => {
      const { container } = renderAssets({ resources: [makeResource({ name: 'house.png' })], viewMode });

      startRename(container);

      expect(screen.getByRole('textbox')).toHaveTextContent('house');
    });

    it('committing calls onRenameResource with the resource id and the extension-free typed value — two arguments only', () => {
      const onRenameResource = vi.fn();
      const { container } = renderAssets({
        resources: [makeResource({ name: 'house.png', path: '/vault/Projects/house.png', parentId: 'projects' })],
        viewMode,
        onRenameResource,
      });

      startRename(container);
      const field = screen.getByRole('textbox');
      fireEvent.input(field, { target: { textContent: 'cottage' } });
      fireEvent.blur(field);

      expect(onRenameResource).toHaveBeenCalledWith('resource-1', 'cottage');
      expect(onRenameResource.mock.calls[0]).toHaveLength(2);
    });

    it('preserves the extension — the typed value never includes it', () => {
      const onRenameResource = vi.fn();
      const { container } = renderAssets({
        resources: [makeResource({ kind: 'pdf', name: 'manual.pdf' })],
        viewMode,
        onRenameResource,
      });

      startRename(container);
      const field = screen.getByRole('textbox');
      fireEvent.input(field, { target: { textContent: 'guide' } });
      fireEvent.blur(field);

      expect(onRenameResource).toHaveBeenCalledWith('resource-1', 'guide');
    });

    it('an item mid-rename does not open the asset on click', () => {
      const onOpenResource = vi.fn();
      const { container } = renderAssets({ resources: [makeResource()], viewMode, onOpenResource });

      startRename(container);
      fireEvent.click(screen.getByRole('textbox'));

      expect(onOpenResource).not.toHaveBeenCalled();
    });

    it('only the focused item enters rename, and other keys do nothing', () => {
      const { container } = renderAssets({
        resources: [makeResource({ id: 'a', name: 'a.png' }), makeResource({ id: 'b', name: 'b.png' })],
        viewMode,
      });

      const second = itemFor(container, viewMode, 1);
      fireEvent.keyDown(second, { key: 'Enter' });
      expect(screen.queryByRole('textbox')).toBeNull();

      fireEvent.keyDown(second, { key: 'F2' });
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      expect(itemFor(container, viewMode, 1).querySelector('[role="textbox"]')).not.toBeNull();
      expect(itemFor(container, viewMode, 0).querySelector('[role="textbox"]')).toBeNull();
    });
  });
});

describe('AssetsCollectionBody — which layout renders', () => {
  const resources = () => [makeResource({ id: 'house', name: 'house.png', kind: 'image' })];

  it('List uses the shared list grid + list rows (the same ones notes use)', () => {
    const { container } = renderAssets({ resources: resources(), viewMode: 'list' });

    expect(container.querySelector('.collection-list > .collection-row')).not.toBeNull();
    expect(container.querySelector('.collection-table, .collection-grid')).toBeNull();
  });

  it('Table uses the generic table with Name, Preview, Type and Source columns', () => {
    const { container } = renderAssets({ resources: resources(), viewMode: 'table' });

    expect([...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual([
      'Name',
      'Preview',
      'Type',
      'Source',
    ]);
    expect(container.querySelector('.collection-table__body > .collection-table-row')).not.toBeNull();
    // No "new item" footer row: an asset has no "New" row of its own (Add lives in the header).
    expect(container.querySelector('.collection-table-row--new-item')).toBeNull();
  });

  it('List shows each asset\'s preview as the row\'s trailing media, in the same frame the table uses', () => {
    const { container } = renderAssets({
      resources: [
        makeResource({ id: 'house', name: 'house.png', kind: 'image', path: '/vault/Assets/house.png' }),
        makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf', path: '/vault/Assets/manual.pdf' }),
      ],
      viewMode: 'list',
    });

    const [imageRow, pdfRow] = [...container.querySelectorAll('.collection-row')];
    expect(imageRow!.querySelector('.collection-row__media .collection-media img')).toHaveAttribute(
      'src',
      'app://vault/Assets/house.png'
    );
    expect(pdfRow!.querySelector('.collection-row__media .collection-media .asset-pdf-preview')).not.toBeNull();
  });

  it('Table draws each asset with the generic header, media (thumbnail) and text cells', () => {
    const { container } = renderAssets({
      resources: [
        makeResource({ id: 'house', name: 'house.png', kind: 'image', path: '/vault/Assets/house.png' }),
        makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf', path: '/vault/Assets/manual.pdf' }),
      ],
      viewMode: 'table',
    });

    const [imageRow, pdfRow] = [...container.querySelectorAll('.collection-table-row')];
    for (const row of [imageRow!, pdfRow!]) {
      expect(row.children).toHaveLength(4);
      expect(row.children[0]).toHaveClass('collection-table-cell--header');
      expect(row.children[1]).toHaveClass('collection-table-cell--media', 'collection-table-row__preview');
      expect(row.children[2]).toHaveClass('collection-table-cell--text', 'collection-table-row__type');
      expect(row.children[3]).toHaveClass('collection-table-cell--text', 'collection-table-row__source');
    }

    // The thumbnail is the image itself / a PDF's first page, inside the generic frame.
    expect(imageRow!.querySelector('.collection-media img')).toHaveAttribute(
      'src',
      'app://vault/Assets/house.png'
    );
    expect(pdfRow!.querySelector('.collection-media .asset-pdf-preview')).not.toBeNull();
  });

  it('Table shows the kind icon in the Preview column when there is no URL resolver', () => {
    const { container } = renderAssets({
      resources: resources(),
      viewMode: 'table',
      resolveResourceUrl: undefined,
    });

    expect(container.querySelector('.collection-media img')).toBeNull();
    expect(container.querySelector('.collection-media .app-icon')).not.toBeNull();
  });

  it('Card uses the generic grid of generic overlay cards — one per asset, no asset-specific card', () => {
    const { container } = renderAssets({ resources: resources(), viewMode: 'card' });

    const card = container.querySelector('.collection-grid > .collection-card');
    expect(card).not.toBeNull();
    expect(card).toHaveClass('collection-card--layout-overlay');
    expect(container.querySelector('.note-page-canvas')).toBeNull();
  });

  it('defaults to List when no layout is given', () => {
    const { container } = renderAssets({ resources: resources() });

    expect(container.querySelector('.collection-list')).not.toBeNull();
  });
});

describe('AssetsCollectionBody — Card previews', () => {
  it('an image card shows the resolved image (existing resolver), filling its area like a cover', () => {
    const { container } = renderAssets({
      resources: [makeResource({ id: 'house', name: 'house.png', path: '/vault/house.png' })],
      viewMode: 'card',
    });

    expect(container.querySelector('.collection-card__media img')).toHaveAttribute('src', 'app://vault/house.png');
  });

  it('a pdf card gets the PDF preview slot, not an image', () => {
    const { container } = renderAssets({
      resources: [makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf', path: '/vault/manual.pdf' })],
      viewMode: 'card',
    });

    expect(container.querySelector('.asset-pdf-preview')).not.toBeNull();
    expect(container.querySelector('.collection-card__media img')).toBeNull();
  });
});

describe.each(LAYOUTS)('AssetsCollectionBody — sort (%s layout)', (viewMode) => {
  const resources = () => [
    makeResource({ id: 'z', name: 'zebra.png', kind: 'image', path: '/vault/zebra.png' }),
    makeResource({ id: 'a', name: 'apple.pdf', kind: 'pdf', path: '/vault/apple.pdf' }),
    makeResource({ id: 'm', name: 'mango.png', kind: 'image', path: '/vault/mango.png' }),
  ];
  const order = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>(ITEM_SELECTOR[viewMode])].map((item) => item.dataset.resourceId);

  it('keeps the given order when there is no sort', () => {
    const { container } = renderAssets({ resources: resources(), viewMode });

    expect(order(container)).toEqual(['z', 'a', 'm']);
  });

  it('sorts by Name A→Z (down) and Z→A (up)', () => {
    const down = renderAssets({ resources: resources(), viewMode, sort: { key: 'name', direction: 'down' } });
    expect(order(down.container)).toEqual(['a', 'm', 'z']);
    cleanup();

    const up = renderAssets({ resources: resources(), viewMode, sort: { key: 'name', direction: 'up' } });
    expect(order(up.container)).toEqual(['z', 'm', 'a']);
  });

  it('sorts by Type: images first (names A→Z within), then PDFs; up reverses', () => {
    const down = renderAssets({ resources: resources(), viewMode, sort: { key: 'type', direction: 'down' } });
    expect(order(down.container)).toEqual(['m', 'z', 'a']);
    cleanup();

    const up = renderAssets({ resources: resources(), viewMode, sort: { key: 'type', direction: 'up' } });
    expect(order(up.container)).toEqual(['a', 'z', 'm']);
  });

  it('does not reorder the caller’s array', () => {
    const input = Object.freeze(resources());

    expect(() => renderAssets({ resources: input as VaultResource[], viewMode, sort: { key: 'name', direction: 'down' } })).not.toThrow();
  });
});

describe('AssetsCollectionBody — Title property', () => {
  const hidden = { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, title: false };

  it('hides each card title in Card layout when the Title property is off', () => {
    const { container } = renderAssets({ resources: [makeResource()], viewMode: 'card', properties: hidden });

    expect(container.querySelector('.collection-card--layout-overlay')).not.toBeNull();
    expect(container.querySelector('.card-title-section')).toBeNull();
  });

  it('shows it by default, and the property does not affect List or Table', () => {
    const shown = renderAssets({ resources: [makeResource()], viewMode: 'card' });
    expect(shown.container.querySelector('.card-title-section')).not.toBeNull();
    shown.unmount();

    for (const viewMode of ['list', 'table'] as const) {
      const { container, unmount } = renderAssets({ resources: [makeResource()], viewMode, properties: hidden });
      expect(container.textContent).toContain('house');
      unmount();
    }
  });

  it('F2 does not start a rename while the card title is hidden', () => {
    const { container } = renderAssets({ resources: [makeResource()], viewMode: 'card', properties: hidden });
    const card = container.querySelector<HTMLElement>('.collection-card--layout-overlay')!;

    card.focus();
    fireEvent.keyDown(card, { key: 'F2' });

    expect(container.querySelector('input')).toBeNull();
  });
});

describe('AssetsCollectionBody — metadata properties', () => {
  const withMetadata = makeResource({
    metadata: { size: 12_345, createdAt: '2020-01-02T03:04:05.000Z', modifiedAt: '2020-02-03T04:05:06.000Z' },
  });
  const lines = (container: HTMLElement) =>
    [...container.querySelectorAll('.card-title-section__metadata-item')].map(
      (row) =>
        `${row.querySelector('.card-title-section__metadata-label')?.textContent}: ${row.querySelector('.card-title-section__metadata-value')?.textContent}`
    );

  it('shows none of them on a card by default (a first-time user), though the title stays', () => {
    const { container } = renderAssets({ resources: [withMetadata], viewMode: 'card' });

    expect(lines(container)).toEqual([]);
    expect(container.querySelector('.card-title-section')).not.toBeNull();
  });

  it('shows File size, Created and Edited once their properties are on, one per line', () => {
    const { container } = renderAssets({
      resources: [withMetadata],
      viewMode: 'card',
      properties: { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, size: true, created: true, updated: true },
    });

    const items = lines(container);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('Size: 12 KB');
    expect(items[1]).toMatch(/^Created: /);
    expect(items[2]).toMatch(/^Edited: /);
  });

  it('hides each one when its property is off', () => {
    const on = { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, size: true, created: true, updated: true };
    const off = (key: 'size' | 'created' | 'updated') => ({ ...on, [key]: false });

    expect(lines(renderAssets({ resources: [withMetadata], viewMode: 'card', properties: off('size') }).container)).toHaveLength(2);
    cleanup();
    const noCreated = lines(renderAssets({ resources: [withMetadata], viewMode: 'card', properties: off('created') }).container);
    expect(noCreated.some((line) => line.startsWith('Created:'))).toBe(false);
    cleanup();
    const noEdited = lines(renderAssets({ resources: [withMetadata], viewMode: 'card', properties: off('updated') }).container);
    expect(noEdited.some((line) => line.startsWith('Edited:'))).toBe(false);
  });
});

describe('AssetsCollectionBody — remote assets', () => {
  const remote: RemoteAsset = {
    id: 'remote:https://example.com/mountain.jpg',
    source: 'remote',
    kind: 'image',
    name: 'mountain.jpg',
    url: 'https://example.com/mountain.jpg',
    references: [],
  };

  it.each(LAYOUTS)('%s lists a remote asset beside a vault file, previewed from its own URL', (viewMode) => {
    const { container } = renderAssets({ resources: [makeResource()], assets: [localAsset(makeResource()), remote], viewMode });

    expect(container.querySelectorAll(ITEM_SELECTOR[viewMode])).toHaveLength(2);
    expect(container.textContent).toContain('mountain');
    expect(container.querySelector(`img[src="${remote.url}"]`)).not.toBeNull();
  });

  it.each(LAYOUTS)('%s opens a remote asset with the asset itself', (viewMode) => {
    const onOpenAsset = vi.fn();
    const { container } = renderAssets({ assets: [remote], viewMode, onOpenAsset });

    fireEvent.click(itemFor(container, viewMode));

    expect(onOpenAsset).toHaveBeenCalledWith(remote);
  });

  it.each(LAYOUTS)('%s: F2 on a remote asset renames nothing (there is no file)', (viewMode) => {
    const { container } = renderAssets({ assets: [remote], viewMode });
    const item = itemFor(container, viewMode);

    item.focus();
    fireEvent.keyDown(item, { key: 'F2' });

    expect(container.querySelector('input')).toBeNull();
  });

  it('says where an asset lives: the list marks a remote one, the table has a Source column', () => {
    const list = renderAssets({ assets: [remote, localAsset(makeResource())], viewMode: 'list' });
    expect(list.container.textContent).toContain('Remote');
    list.unmount();

    const table = renderAssets({ assets: [remote, localAsset(makeResource())], viewMode: 'table' });
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('Vault')).toBeInTheDocument();
    table.unmount();
  });
});

describe('AssetsCollectionBody — Card grid', () => {
  it('uses the asset grid — up to 6 columns, at least 140px each — and the 4:5 card shape, set through the generic grid and card props', () => {
    const { container } = renderAssets({ resources: [makeResource()], viewMode: 'card' });

    const grid = container.querySelector<HTMLElement>('.collection-grid')!;
    expect(grid.style.getPropertyValue('--collection-grid-min')).toBe('140px');
    expect(grid.style.getPropertyValue('--collection-grid-max')).toBe('6');
    expect(container.querySelector<HTMLElement>('.collection-card')!.style.aspectRatio).toBe('4 / 5');
  });
});

describe('AssetsCollectionBody — Upload card', () => {
  it('ends the Card grid with an empty "+"-style Upload card that calls onUpload — after every asset', () => {
    const onUpload = vi.fn();
    const { container, getByLabelText } = renderAssets({ resources: [makeResource(), makeResource({ id: 'r2', name: 'b.png' })], viewMode: 'card', onUpload });

    const grid = container.querySelector('.collection-grid')!;
    expect(grid.lastElementChild).toHaveClass('collection-card--empty');
    expect(grid.querySelectorAll('.collection-card--layout-overlay')).toHaveLength(2);

    // The same empty card as every other collection's: a plain "+" (no custom icon), named for assistive tech.
    expect(grid.lastElementChild!.querySelector('.app-icon svg')).not.toBeNull();
    expect(grid.lastElementChild!.querySelector('.collection-card__header')).toBeNull();

    fireEvent.click(getByLabelText('Upload'));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('is still there with no assets at all', () => {
    const { container } = renderAssets({ resources: [], viewMode: 'card', onUpload: vi.fn() });

    expect(container.querySelectorAll('.collection-card--layout-overlay')).toHaveLength(0);
    expect(container.querySelector('.collection-card--empty')).not.toBeNull();
  });

  it('is not rendered without an upload handler, nor in List or Table', () => {
    expect(renderAssets({ resources: [makeResource()], viewMode: 'card' }).container.querySelector('.collection-card--empty')).toBeNull();
    cleanup();

    for (const viewMode of ['list', 'table'] as const) {
      const { container, unmount } = renderAssets({ resources: [makeResource()], viewMode, onUpload: vi.fn() });
      expect(container.querySelector('.collection-card--empty')).toBeNull();
      unmount();
    }
  });
});
