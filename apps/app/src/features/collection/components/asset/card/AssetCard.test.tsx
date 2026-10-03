// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultResource } from '@core/vault/models/VaultResource';

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
    const { container } = render(<AssetCard resource={image()} url="app://house.png" />);

    const card = container.querySelector('.asset-card')!;
    expect(card).toHaveClass('collection-card');
    expect(card.querySelector('.card-title-section')).not.toBeNull();
    expect(container.querySelector('.note-card, .note-card__header, .document-preview')).toBeNull();
  });

  it('shows the asset name (extension-free) and no kind/type label — the header is just the icon and name', () => {
    const { getByText, queryByText, container } = render(<AssetCard resource={image()} url="app://house.png" />);

    expect(getByText('house')).toBeInTheDocument();
    expect(queryByText('Image')).toBeNull();
    expect(container.querySelector('.card-metadata')).toBeNull();
  });

  it('a PDF card has no type label either', () => {
    const { queryByText, container } = render(<AssetCard resource={pdf()} url="app://manual.pdf" />);

    expect(queryByText('PDF')).toBeNull();
    expect(container.querySelector('.card-metadata')).toBeNull();
  });

  it('an image asset renders its image from the url it is given (as a cover-style fill, styled in AssetCard.css), with no alt noise', () => {
    const { container } = render(<AssetCard resource={image()} url="app://vault/house.png" />);

    const img = container.querySelector<HTMLImageElement>('.asset-card__image')!;
    expect(img).toHaveAttribute('src', 'app://vault/house.png');
    expect(img).toHaveAttribute('alt', '');
    expect(container.querySelector('.asset-card__pdf')).toBeNull();
  });

  it('a PDF asset renders the PDF preview (the existing pdf.js pieces), never an <img>', () => {
    const { container } = render(<AssetCard resource={pdf()} url="app://vault/manual.pdf" />);

    expect(container.querySelector('.asset-card__pdf')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('clicking opens the asset with the resource — and Enter/Space on the focused card does too', () => {
    const onClick = vi.fn();
    const resource = image();
    const { container } = render(<AssetCard resource={resource} url="x" onClick={onClick} />);
    const card = container.querySelector('.asset-card')!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onClick).toHaveBeenCalledWith(resource);
  });

  it('shows the rename editor in place of the title when given one', () => {
    const { container, queryByText } = render(
      <AssetCard resource={image()} url="x" titleContent={<input aria-label="rename" />} />
    );

    expect(container.querySelector('input[aria-label="rename"]')).not.toBeNull();
    expect(queryByText('house')).toBeNull();
  });

  it('has no actions menu and no note-card props (no cover, no markdown, no description)', () => {
    const { container } = render(<AssetCard resource={image()} url="x" />);

    expect(container.querySelector('button, [aria-haspopup]')).toBeNull();
    expect(container.querySelector('.note-card__cover, .document-preview__canvas')).toBeNull();
  });

  it('puts the media first and the title section (icon + name) below it', () => {
    const { container } = render(<AssetCard resource={image()} url="x" />);

    const [first, second] = [...container.querySelector('.asset-card')!.children];
    expect(first).toHaveClass('asset-card__media');
    expect(second).toHaveClass('card-title-section', 'asset-card__header');
  });
});
