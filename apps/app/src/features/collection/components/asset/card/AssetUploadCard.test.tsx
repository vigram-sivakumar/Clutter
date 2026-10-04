// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetUploadCard } from './AssetUploadCard';

afterEach(cleanup);

describe('AssetUploadCard', () => {
  it('is a shared-shell card labelled Upload, with the plain upload icon (not the image-upload one) and no media or metadata', () => {
    const { container, getByText } = render(<AssetUploadCard onClick={vi.fn()} />);

    const card = container.querySelector('.asset-upload-card')!;
    expect(card).toHaveClass('collection-card');
    expect(getByText('Upload')).toBeInTheDocument();
    expect(card.querySelector('.card-title-section__leading svg')).not.toBeNull();
    expect(card.querySelector('.asset-card__media, .card-metadata')).toBeNull();
  });

  it('uploads on click, and on Enter / Space when focused', () => {
    const onClick = vi.fn();
    const { container } = render(<AssetUploadCard onClick={onClick} />);
    const card = container.querySelector('.asset-upload-card')!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('its stylesheet only targets the upload card', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AssetUploadCard.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].flatMap(([, selector]) => selector!.split(',').map((part) => part.trim()));

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^\.asset-upload-card/);
    }
  });
});
