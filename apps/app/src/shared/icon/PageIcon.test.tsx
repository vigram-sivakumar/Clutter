// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { PageIcon } from './PageIcon';

describe('PageIcon', () => {
  it.each([
    ['small', '20px', '16px'],
    ['medium', '24px', '16px'],
    ['large', '72px', '64px'],
  ] as const)('uses the %s size contract', (size, slot, glyph) => {
    const { container } = render(<PageIcon emoji="📝" size={size} />);
    const icon = container.querySelector('.page-icon') as HTMLElement;

    expect(icon.style.getPropertyValue('--page-icon-slot-size')).toBe(slot);
    expect(icon.style.getPropertyValue('--page-icon-glyph-size')).toBe(glyph);
  });

  it('keeps the fallback visible until the image has loaded', () => {
    const { container } = render(
      <PageIcon emoji="📝" imageSrc="asset://icon.png" size="small" />
    );
    const image = container.querySelector('img') as HTMLImageElement;
    const fallback = container.querySelector('.page-icon__fallback') as HTMLElement;

    expect(image.style.visibility).toBe('hidden');
    expect(fallback.style.visibility).toBe('');

    fireEvent.load(image);

    expect(image.style.visibility).toBe('');
    expect(fallback.style.visibility).toBe('hidden');
  });

  it('removes a failed image and immediately restores the fallback', () => {
    const { container } = render(
      <PageIcon emoji="📝" imageSrc="asset://missing.png" size="small" />
    );
    const image = container.querySelector('img') as HTMLImageElement;

    fireEvent.error(image);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.emoji-icon')?.textContent).toBe('📝');
  });

  it('keeps the fallback visible while a replacement image loads', () => {
    const { container, rerender } = render(
      <PageIcon emoji="📝" imageSrc="asset://first.png" size="small" />
    );
    const firstImage = container.querySelector('img') as HTMLImageElement;

    fireEvent.load(firstImage);
    expect(firstImage.style.visibility).toBe('');

    rerender(<PageIcon emoji="📄" imageSrc="asset://second.png" size="small" />);

    const replacementImage = container.querySelector('img') as HTMLImageElement;
    const fallback = container.querySelector('.page-icon__fallback') as HTMLElement;

    expect(replacementImage.getAttribute('src')).toBe('asset://second.png');
    expect(replacementImage.style.visibility).toBe('hidden');
    expect(fallback.style.visibility).toBe('');
    expect(fallback.querySelector('.emoji-icon')?.textContent).toBe('📄');
  });

  it('reports a decode failure so the owner can clear stale metadata', () => {
    const onImageError = vi.fn();
    const { container } = render(
      <PageIcon emoji="📝" imageSrc="asset://broken.png" onImageError={onImageError} />
    );

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(onImageError).toHaveBeenCalledTimes(1);
  });

  it('renders the system fallback when no emoji is set', () => {
    const { container } = render(
      <PageIcon systemIcon={getPageIcon("note")} imageSrc="asset://missing.png" size="small" />
    );

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('.app-icon svg')).not.toBeNull();
  });
});
