// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetThumbnail } from './AssetThumbnail';

vi.mock('@features/pdf/usePdfDocument', () => ({
  usePdfDocument: vi.fn(() => ({ status: 'loading' as const })),
}));

afterEach(cleanup);

describe('AssetThumbnail', () => {
  it('shows an image, and falls back to the kind icon when it fails to load', () => {
    const { container } = render(<AssetThumbnail kind="image" url="app://house.png" />);

    const img = container.querySelector('img.asset-thumbnail__image')!;
    expect(img).toHaveAttribute('src', 'app://house.png');

    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.asset-thumbnail__icon')).not.toBeNull();
  });

  it('renders a PDF through the shared first-page preview, in its own wrapper (not the card one)', () => {
    const { container } = render(<AssetThumbnail kind="pdf" url="app://manual.pdf" />);

    expect(container.querySelector('.asset-thumbnail__pdf')).not.toBeNull();
    expect(container.querySelector('.asset-card__pdf')).toBeNull();
  });

  it('shows the kind icon when there is no URL', () => {
    const { container } = render(<AssetThumbnail kind="pdf" />);

    expect(container.querySelector('.asset-thumbnail__icon')).not.toBeNull();
    expect(container.querySelector('.asset-thumbnail__pdf, img')).toBeNull();
  });
});
