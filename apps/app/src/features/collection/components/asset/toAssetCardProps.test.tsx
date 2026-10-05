// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultResource } from '@core/vault/models/VaultResource';
import type { Asset, RemoteAsset } from '@core/vault/models/Asset';
import { localAsset } from '@core/vault/testing/localAsset';
import type { PropertyId } from '@core/properties/collectionProperties';
import { CollectionCard } from '@features/collection/components/card/CollectionCard';

import { ASSET_CARD_ASPECT_RATIO, ASSET_GRID, toAssetCardProps, type AssetCardOptions } from './toAssetCardProps';

vi.mock('@features/pdf/usePdfDocument', () => ({
  usePdfDocument: vi.fn(() => ({ status: 'loading' as const })),
}));

afterEach(cleanup);

const image = (overrides: Partial<VaultResource> = {}): VaultResource => ({
  id: 'img',
  kind: 'image',
  name: 'house.png',
  path: '/vault/house.png',
  parentId: null,
  ...overrides,
});
const pdf = (): VaultResource => ({ id: 'doc', kind: 'pdf', name: 'manual.pdf', path: '/vault/manual.pdf', parentId: null });

/** An asset as the generic card draws it — the mapper's props through the real primitive. */
// Every property an asset card can draw, visible — what a card shows unless a test narrows it.
const ALL: PropertyId[] = ['name', 'size', 'created', 'updated'];

function renderCard(asset: Asset, options: Partial<AssetCardOptions> = {}) {
  return render(<CollectionCard {...toAssetCardProps(asset, { visible: ALL, ...options })} />);
}
const METADATA = { size: 12_345, createdAt: '2020-01-02T03:04:05.000Z', modifiedAt: '2020-02-03T04:05:06.000Z' };

describe('toAssetCardProps', () => {
  it('draws an overlay card of the asset shape, on the generic card — no asset-specific card component', () => {
    const { container } = renderCard(localAsset(image()), { url: 'app://house.png' });
    const card = container.firstElementChild!;

    expect(card).toHaveClass('collection-card', 'collection-card--layout-overlay');
    expect((card as HTMLElement).style.aspectRatio).toBe(ASSET_CARD_ASPECT_RATIO);
    expect(ASSET_GRID).toEqual({ min: 140, max: 6 });
  });

  it('shows the asset name (extension-free) and no kind/type label — the header is just the icon and name', () => {
    const { getByText, queryByText, container } = renderCard(localAsset(image()), { url: 'app://house.png' });

    expect(getByText('house')).toBeInTheDocument();
    expect(queryByText('Image')).toBeNull();
    expect(container.querySelector('.card-title-section__metadata')).toBeNull();
  });

  it('a PDF card has no type label either', () => {
    const { queryByText, container } = renderCard(localAsset(pdf()), { url: 'app://manual.pdf' });

    expect(queryByText('PDF')).toBeNull();
    expect(container.querySelector('.card-title-section__metadata')).toBeNull();
  });

  it('an image asset renders its image from the url it is given, with no alt noise', () => {
    const { container } = renderCard(localAsset(image()), { url: 'app://vault/house.png' });

    const img = container.querySelector<HTMLImageElement>('.collection-card__media img')!;
    expect(img).toHaveAttribute('src', 'app://vault/house.png');
    expect(img).toHaveAttribute('alt', '');
    expect(container.querySelector('.asset-pdf-preview')).toBeNull();
  });

  it('a PDF asset renders the PDF preview (the existing pdf.js pieces), never an <img>', () => {
    const { container } = renderCard(localAsset(pdf()), { url: 'app://vault/manual.pdf' });

    expect(container.querySelector('.asset-pdf-preview')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('clicking opens the asset with the asset — and Enter/Space on the focused card does too', () => {
    const onClick = vi.fn();
    const asset = localAsset(image());
    const { container } = renderCard(asset, { url: 'x', onClick });
    const card = container.firstElementChild!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledWith(asset);
  });

  it('without onClick (while renaming) the card is inert', () => {
    const { container } = renderCard(localAsset(image()), { url: 'x' });

    expect(container.firstElementChild).not.toHaveAttribute('role');
  });

  it('shows the rename editor in place of the title when given one', () => {
    const { container, queryByText } = renderCard(localAsset(image()), {
      url: 'x',
      titleContent: <input aria-label="rename" />,
    });

    expect(container.querySelector('input[aria-label="rename"]')).not.toBeNull();
    expect(queryByText('house')).toBeNull();
  });

  it('has no actions menu and no note props (no cover, no markdown, no description)', () => {
    const { container } = renderCard(localAsset(image()), { url: 'x' });

    expect(container.querySelector('button, [aria-haspopup]')).toBeNull();
    expect(container.querySelector('.note-page-canvas, .card-title-section__description')).toBeNull();
  });

  it('puts the media first and the header (icon + name) over it', () => {
    const { container } = renderCard(localAsset(image()), { url: 'x' });

    const [first, second] = [...container.firstElementChild!.children];
    expect(first).toHaveClass('collection-card__media');
    expect(second).toHaveClass('collection-card__header');
    expect(second!.querySelector('.card-title-section--title-bottom')).not.toBeNull();
  });

  it('with the name not visible, drops the title section and leaves the media', () => {
    const { container } = renderCard(localAsset(image()), { url: 'x', visible: ['size', 'created', 'updated'] });

    const card = container.firstElementChild!;
    expect(card.querySelector('.card-title-section')).toBeNull();
    expect([...card.children]).toHaveLength(1);
    expect(card.children[0]).toHaveClass('collection-card__media');
  });

  it('stacks the size and dates from the resource metadata under the name, one per line, label apart from value', () => {
    const withMetadata = renderCard(localAsset(image({ metadata: METADATA })), { url: 'x' });
    const line = withMetadata.container.querySelector('.card-title-section__metadata')!;
    expect(line).toHaveClass('card-title-section__metadata--vertical', 'card-title-section__metadata--spread');
    const rows = [...line.querySelectorAll('.card-title-section__metadata-item')];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector('.card-title-section__metadata-label')!.textContent)).toEqual([
      'Size',
      'Created',
      'Edited',
    ]);
    expect(rows[0]!.querySelector('.card-title-section__metadata-value')).toHaveTextContent('12 KB');
    withMetadata.unmount();

    const without = renderCard(localAsset(image()), { url: 'x' });
    expect(without.container.querySelector('.card-title-section__metadata')).toBeNull();
  });

  describe('a remote asset', () => {
    const remote: RemoteAsset = {
      id: 'remote:https://example.com/mountain.jpg',
      source: 'remote',
      kind: 'image',
      name: 'mountain.jpg',
      url: 'https://example.com/mountain.jpg',
      references: [],
    };

    it('shows the image from its URL under its extension-free name, with no file metadata line', () => {
      const { container, getByText } = renderCard(remote, {
        url: remote.url,
        visible: ALL,
      });

      expect(container.querySelector('img')).toHaveAttribute('src', remote.url);
      expect(getByText('mountain')).toBeInTheDocument();
      // A URL has no file size or timestamps to show, however the properties are set.
      expect(container.querySelector('.card-title-section__metadata')).toBeNull();
    });

    it('is not a rename target (no data-resource-id) and opens with the asset on click', () => {
      const onClick = vi.fn();
      const { container } = renderCard(remote, { url: remote.url, onClick });
      const card = container.firstElementChild!;

      expect(card.hasAttribute('data-resource-id')).toBe(false);
      fireEvent.click(card);
      expect(onClick).toHaveBeenCalledWith(remote);
    });
  });

  it('a vault file carries its resource id for the F2-to-rename handler', () => {
    const { container } = renderCard(localAsset(image()), { url: 'x' });

    expect(container.firstElementChild).toHaveAttribute('data-resource-id', 'img');
  });

  it('hiding the title keeps the metadata lines — they are their own properties', () => {
    const { container, queryByText } = renderCard(localAsset(image({ metadata: METADATA })), {
      url: 'x',
      visible: ['size', 'created', 'updated'],
    });

    const header = container.querySelector('.collection-card__header')!;
    expect([...header.querySelectorAll('.card-title-section__metadata-label')].map((node) => node.textContent)).toEqual([
      'Size',
      'Created',
      'Edited',
    ]);
    // Only the icon and name are gone — not even an empty name row is left behind.
    expect(queryByText('house')).toBeNull();
    expect(header.querySelector('.card-title-section__heading')).toBeNull();
  });

  it('with the title and every metadata line off, nothing is laid over the media', () => {
    const { container } = renderCard(localAsset(image({ metadata: { ...METADATA, size: 1 } })), {
      url: 'x',
      visible: [],
    });

    expect(container.querySelector('.collection-card__header')).toBeNull();
  });
});
