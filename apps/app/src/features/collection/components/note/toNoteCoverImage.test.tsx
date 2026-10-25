// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('hides an empty cover until its table or list row is hovered or focused, without taking its room (CSS contract)', () => {
    const css = readFileSync(join(__dirname, 'toNoteCoverImage.css'), 'utf8');

    expect(css).toMatch(/\.collection-media:has\(\.note-cover-image__empty\)\s*\{\s*opacity: 0;\s*\}/);
    expect(css).toMatch(
      /:is\(\.collection-table-row, \.collection-entry--layout-list\):not\([^)]*\):is\(\s*:hover,\s*:focus-within,\s*\[data-context-menu-open='true'\]\s*\)\s*\.collection-media:has\(\.note-cover-image__empty\)\s*\{\s*opacity: 1;/
    );
    // Hidden by opacity only, so the column's width and the row's height never change.
    expect(css.match(/:has\(\.note-cover-image__empty\)\s*\{[^}]*\}/)![0]).not.toMatch(/display|visibility/);
  });

  it('never offers the empty cover in selection mode, even on hover (CSS contract)', () => {
    const css = readFileSync(join(__dirname, 'toNoteCoverImage.css'), 'utf8');

    // The hover reveal excludes selecting rows; the selecting rule takes the empty cover out of reach too.
    expect(css).toMatch(/:not\(\.collection-table-row--selecting, \.collection-entry--selecting\)/);
    expect(css).toMatch(
      /:is\(\.collection-table-row--selecting, \.collection-entry--selecting\) \.collection-media:has\(\.note-cover-image__empty\)\s*\{\s*pointer-events: none;/
    );
  });
});
