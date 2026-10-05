// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetPreview } from './AssetPreview';

vi.mock('@features/pdf/usePdfDocument', () => ({
  usePdfDocument: vi.fn(() => ({ status: 'loading' as const })),
}));

afterEach(cleanup);

describe('AssetPreview', () => {
  it('shows an image, and falls back to the kind icon when it fails to load', () => {
    const { container } = render(<AssetPreview kind="image" url="app://house.png" />);

    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'app://house.png');

    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.app-icon svg')).not.toBeNull();
  });

  it('renders a PDF through the shared first-page preview', () => {
    const { container } = render(<AssetPreview kind="pdf" url="app://manual.pdf" />);

    expect(container.querySelector('.asset-pdf-preview')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the kind icon when there is no URL', () => {
    const { container } = render(<AssetPreview kind="pdf" />);

    expect(container.querySelector('.app-icon svg')).not.toBeNull();
    expect(container.querySelector('.asset-pdf-preview, img')).toBeNull();
  });
});
