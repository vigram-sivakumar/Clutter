// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { toNoteCoverImage } from './toNoteCoverImage';

afterEach(cleanup);

const draw = (url: string | null | undefined, positionAbove?: number) => render(<>{toNoteCoverImage(url, positionAbove)}</>);

describe('toNoteCoverImage', () => {
  it("shows the cover cropped to fill, framed at the note's own focal point", () => {
    const { container } = draw('app://cover.png', 20);

    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'app://cover.png');
    expect(img.style.objectPosition).toBe('50% 20%');
    expect(container.querySelector('.note-cover-image__empty')).toBeNull();
  });

  it('centers the framing by default', () => {
    const { container } = draw('app://cover.png');

    expect(container.querySelector('img')!.style.objectPosition).toBe('50% 50%');
  });

  it('shows a plus — not an image icon — when the note has no cover', () => {
    for (const url of [undefined, null, '']) {
      const { container } = draw(url);

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('.note-cover-image__empty')).toBeInTheDocument();
      cleanup();
    }
  });

  it('falls back to the plus when the image fails to load', () => {
    const { container } = draw('app://broken.png');

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.note-cover-image__empty')).toBeInTheDocument();
  });

  it('a thumbnail of an Unsplash cover carries the credit as tooltip and accessible name; the image URL is unchanged', () => {
    const url = 'https://images.unsplash.com/photo-a?ixid=1&w=1080';
    const { container } = render(<>{toNoteCoverImage(url, 50, 'Photo by Alex Doe on Unsplash')}</>);

    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', url);
    expect(img).toHaveAttribute('alt', 'Photo by Alex Doe on Unsplash');
    expect(container.querySelector('[title="Photo by Alex Doe on Unsplash"]')).toBeInTheDocument();
  });

  it('adds no wrapper, tooltip or alt text to a cover that has no attribution (non-Unsplash regression)', () => {
    const { container } = draw('app://cover.png');

    expect(container.firstElementChild!.tagName).toBe('IMG');
    expect(container.querySelector('[title]')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });
});
