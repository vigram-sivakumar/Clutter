// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssetsCollectionBody } from './AssetsCollectionBody';
import { DEFAULT_COLLECTION_PROPERTY_VISIBILITY, type CollectionViewMode } from './CollectionBody';
import type { VaultResource } from '@core/vault/models/VaultResource';

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
  props: Partial<Omit<Parameters<typeof AssetsCollectionBody>[0], 'resources'>> & {
    resources: VaultResource[];
  }
) {
  return render(
    <AssetsCollectionBody onRenameResource={vi.fn()} resolveResourceUrl={resolveResourceUrl} {...props} />
  );
}

/** The item element for each layout — the shared layer's own row/card class. */
const ITEM_SELECTOR: Record<CollectionViewMode, string> = {
  list: '.collection-list-row',
  table: '.collection-table-row',
  card: '.asset-card',
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
      expect(container.querySelector('.card-metadata')).toBeNull();
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
      itemFor(container, viewMode, index).querySelector('.collection-entry__icon svg, .card-title-section__icon svg')?.outerHTML;
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

    expect(container.querySelector('.collection-list-grid > .collection-list-row')).not.toBeNull();
    expect(container.querySelector('.collection-table, .collection-card-grid')).toBeNull();
  });

  it('Table uses the generic table with Name, Preview and Type columns', () => {
    const { container } = renderAssets({ resources: resources(), viewMode: 'table' });

    expect([...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual([
      'Name',
      'Preview',
      'Type',
    ]);
    expect(container.querySelector('.collection-table__body > .collection-table-row')).not.toBeNull();
    // No "new item" footer row: an asset has no "New" row of its own (Add lives in the header).
    expect(container.querySelector('.collection-table__new-item')).toBeNull();
  });

  it('List shows each asset\'s preview as the row\'s trailing media, in the same frame the table uses', () => {
    const { container } = renderAssets({
      resources: [
        makeResource({ id: 'house', name: 'house.png', kind: 'image', path: '/vault/Assets/house.png' }),
        makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf', path: '/vault/Assets/manual.pdf' }),
      ],
      viewMode: 'list',
    });

    const [imageRow, pdfRow] = [...container.querySelectorAll('.collection-list-row')];
    expect(imageRow!.querySelector('.collection-entry__media .collection-media img')).toHaveAttribute(
      'src',
      'app://vault/Assets/house.png'
    );
    expect(pdfRow!.querySelector('.collection-entry__media .collection-media .asset-thumbnail__pdf')).not.toBeNull();
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
      expect(row.children).toHaveLength(3);
      expect(row.children[0]).toHaveClass('collection-table-cell--header');
      expect(row.children[1]).toHaveClass('collection-table-cell--media', 'collection-table-row__preview');
      expect(row.children[2]).toHaveClass('collection-table-cell--text', 'collection-table-row__type');
    }

    // The thumbnail is the image itself / a PDF's first page, inside the generic frame.
    expect(imageRow!.querySelector('.collection-media img')).toHaveAttribute(
      'src',
      'app://vault/Assets/house.png'
    );
    expect(pdfRow!.querySelector('.collection-media .asset-thumbnail__pdf')).not.toBeNull();
  });

  it('Table shows the kind icon in the Preview column when there is no URL resolver', () => {
    const { container } = renderAssets({
      resources: resources(),
      viewMode: 'table',
      resolveResourceUrl: undefined,
    });

    expect(container.querySelector('.collection-media img')).toBeNull();
    expect(container.querySelector('.collection-media .asset-thumbnail__icon')).not.toBeNull();
  });

  it('Card uses the shared card grid with a dedicated AssetCard per asset', () => {
    const { container } = renderAssets({ resources: resources(), viewMode: 'card' });

    const card = container.querySelector('.collection-card-grid > .asset-card');
    expect(card).not.toBeNull();
    expect(card).toHaveClass('collection-card');
    expect(container.querySelector('.note-card, .document-preview')).toBeNull();
  });

  it('defaults to List when no layout is given', () => {
    const { container } = renderAssets({ resources: resources() });

    expect(container.querySelector('.collection-list-grid')).not.toBeNull();
  });
});

describe('AssetsCollectionBody — Card previews', () => {
  it('an image card shows the resolved image (existing resolver), filling its area like a cover', () => {
    const { container } = renderAssets({
      resources: [makeResource({ id: 'house', name: 'house.png', path: '/vault/house.png' })],
      viewMode: 'card',
    });

    expect(container.querySelector('.asset-card__image')).toHaveAttribute('src', 'app://vault/house.png');
  });

  it('a pdf card gets the PDF preview slot, not an image', () => {
    const { container } = renderAssets({
      resources: [makeResource({ id: 'manual', name: 'manual.pdf', kind: 'pdf', path: '/vault/manual.pdf' })],
      viewMode: 'card',
    });

    expect(container.querySelector('.asset-card__pdf')).not.toBeNull();
    expect(container.querySelector('.asset-card__image')).toBeNull();
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

    expect(container.querySelector('.asset-card')).not.toBeNull();
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
    const card = container.querySelector<HTMLElement>('.asset-card')!;

    card.focus();
    fireEvent.keyDown(card, { key: 'F2' });

    expect(container.querySelector('input')).toBeNull();
  });
});
