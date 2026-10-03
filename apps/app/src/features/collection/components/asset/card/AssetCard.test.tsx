// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultResource } from '@core/vault/models/VaultResource';
import type { RemoteAsset } from '@core/vault/models/Asset';
import { localAsset } from '@core/vault/testing/localAsset';

import { AssetCard } from './AssetCard';

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

describe('AssetCard', () => {
  it('is built on the shared card shell and title section — not on NoteCard', () => {
    const { container } = render(<AssetCard asset={localAsset(image())} url="app://house.png" />);

    const card = container.querySelector('.asset-card')!;
    expect(card).toHaveClass('collection-card');
    expect(card.querySelector('.card-title-section')).not.toBeNull();
    expect(container.querySelector('.note-card, .note-card__header, .document-preview')).toBeNull();
  });

  it('shows the asset name (extension-free) and no kind/type label — the header is just the icon and name', () => {
    const { getByText, queryByText, container } = render(<AssetCard asset={localAsset(image())} url="app://house.png" />);

    expect(getByText('house')).toBeInTheDocument();
    expect(queryByText('Image')).toBeNull();
    expect(container.querySelector('.card-metadata')).toBeNull();
  });

  it('a PDF card has no type label either', () => {
    const { queryByText, container } = render(<AssetCard asset={localAsset(pdf())} url="app://manual.pdf" />);

    expect(queryByText('PDF')).toBeNull();
    expect(container.querySelector('.card-metadata')).toBeNull();
  });

  it('an image asset renders its image from the url it is given (as a cover-style fill, styled in AssetCard.css), with no alt noise', () => {
    const { container } = render(<AssetCard asset={localAsset(image())} url="app://vault/house.png" />);

    const img = container.querySelector<HTMLImageElement>('.asset-card__image')!;
    expect(img).toHaveAttribute('src', 'app://vault/house.png');
    expect(img).toHaveAttribute('alt', '');
    expect(container.querySelector('.asset-card__pdf')).toBeNull();
  });

  it('a PDF asset renders the PDF preview (the existing pdf.js pieces), never an <img>', () => {
    const { container } = render(<AssetCard asset={localAsset(pdf())} url="app://vault/manual.pdf" />);

    expect(container.querySelector('.asset-card__pdf')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('clicking opens the asset with the asset — and Enter/Space on the focused card does too', () => {
    const onClick = vi.fn();
    const asset = localAsset(image());
    const { container } = render(<AssetCard asset={asset} url="x" onClick={onClick} />);
    const card = container.querySelector('.asset-card')!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledWith(asset);
  });

  it('shows the rename editor in place of the title when given one', () => {
    const { container, queryByText } = render(
      <AssetCard asset={localAsset(image())} url="x" titleContent={<input aria-label="rename" />} />
    );

    expect(container.querySelector('input[aria-label="rename"]')).not.toBeNull();
    expect(queryByText('house')).toBeNull();
  });

  it('has no actions menu and no note-card props (no cover, no markdown, no description)', () => {
    const { container } = render(<AssetCard asset={localAsset(image())} url="x" />);

    expect(container.querySelector('button, [aria-haspopup]')).toBeNull();
    expect(container.querySelector('.note-card__cover, .document-preview__canvas')).toBeNull();
  });

  it('puts the media first and the title section (icon + name) below it', () => {
    const { container } = render(<AssetCard asset={localAsset(image())} url="x" />);

    const [first, second] = [...container.querySelector('.asset-card')!.children];
    expect(first).toHaveClass('asset-card__media');
    expect(second).toHaveClass('card-title-section', 'asset-card__header');
  });

  it('showTitle={false} drops the title section and leaves the media', () => {
    const { container } = render(<AssetCard asset={localAsset(image())} url="x" showTitle={false} />);

    const card = container.querySelector('.asset-card')!;
    expect(card.querySelector('.card-title-section')).toBeNull();
    expect([...card.children]).toHaveLength(1);
    expect(card.children[0]).toHaveClass('asset-card__media');
  });

  it('stacks the size and dates from the resource metadata under the name, one per line, and nothing when there is none', () => {
    const withMetadata = render(
      <AssetCard
        asset={localAsset(image({ metadata: { size: 12_345, createdAt: '2020-01-02T03:04:05.000Z', modifiedAt: '2020-02-03T04:05:06.000Z' } }))}
        url="x"
      />
    );
    const line = withMetadata.container.querySelector('.card-metadata')!;
    expect(line).toHaveClass('card-metadata--vertical');
    const rows = [...line.querySelectorAll('.asset-card__meta')];
    expect(rows).toHaveLength(3);
    // Each line sets its label apart from its value.
    expect(rows.map((row) => row.querySelector('.asset-card__meta-label')!.textContent)).toEqual(['Size', 'Created', 'Edited']);
    expect(rows[0]!.querySelector('.asset-card__meta-value')).toHaveTextContent('12 KB');
    withMetadata.unmount();

    const without = render(<AssetCard asset={localAsset(image())} url="x" />);
    expect(without.container.querySelector('.card-metadata')).toBeNull();
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
      const { container, getByText } = render(
        <AssetCard
          asset={remote}
          url={remote.url}
          metadataVisibility={{ size: true, created: true, updated: true }}
        />
      );

      expect(container.querySelector('img')).toHaveAttribute('src', remote.url);
      expect(getByText('mountain')).toBeInTheDocument();
      // A URL has no file size or timestamps to show, however the properties are set.
      expect(container.querySelector('.card-metadata')).toBeNull();
    });

    it('is not a rename target (no data-resource-id) and opens with the asset on click', () => {
      const onClick = vi.fn();
      const { container } = render(<AssetCard asset={remote} url={remote.url} onClick={onClick} />);
      const card = container.querySelector('.asset-card')!;

      expect(card.hasAttribute('data-resource-id')).toBe(false);
      fireEvent.click(card);
      expect(onClick).toHaveBeenCalledWith(remote);
    });
  });

  it('hiding the title keeps the metadata lines — they are their own properties', () => {
    const metadata = { size: 12_345, createdAt: '2020-01-02T03:04:05.000Z', modifiedAt: '2020-02-03T04:05:06.000Z' };
    const { container, queryByText } = render(
      <AssetCard asset={localAsset(image({ metadata }))} url="x" showTitle={false} metadataVisibility={{ size: true, created: true, updated: true }} />
    );

    const header = container.querySelector('.asset-card__header')!;
    expect([...header.querySelectorAll('.asset-card__meta-label')].map((node) => node.textContent)).toEqual([
      'Size',
      'Created',
      'Edited',
    ]);
    // Only the icon and name are gone — not even an empty name row is left behind.
    expect(queryByText('house')).toBeNull();
    expect(header.querySelector('.card-title-section__heading, .card-title, svg')).toBeNull();
  });

  it('with the title and every metadata line off, nothing is laid over the media', () => {
    const metadata = { size: 1, createdAt: '2020-01-02T03:04:05.000Z', modifiedAt: '2020-02-03T04:05:06.000Z' };
    const { container } = render(
      <AssetCard asset={localAsset(image({ metadata }))} url="x" showTitle={false} metadataVisibility={{ size: false, created: false, updated: false }} />
    );

    expect(container.querySelector('.asset-card__header')).toBeNull();
  });
});
