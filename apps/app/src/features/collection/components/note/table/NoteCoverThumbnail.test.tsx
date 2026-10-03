// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { NoteCoverThumbnail } from './NoteCoverThumbnail';

afterEach(cleanup);

describe('NoteCoverThumbnail', () => {
  it('shows the cover cropped to fill, framed at the note\'s own focal point', () => {
    const { container } = render(<NoteCoverThumbnail url="app://cover.png" positionAbove={20} />);

    const img = container.querySelector('img.note-cover-thumbnail__image')!;
    expect(img).toHaveAttribute('src', 'app://cover.png');
    expect((img as HTMLElement).style.objectPosition).toBe('50% 20%');
    expect(container.querySelector('.note-cover-thumbnail__empty')).toBeNull();
  });

  it('centers the framing by default', () => {
    const { container } = render(<NoteCoverThumbnail url="app://cover.png" />);
    expect((container.querySelector('img') as HTMLElement).style.objectPosition).toBe('50% 50%');
  });

  it('shows a plus — not an image icon — when the note has no cover', () => {
    for (const url of [undefined, null, '']) {
      const { container } = render(<NoteCoverThumbnail url={url} />);

      expect(container.querySelector('img')).toBeNull();
      const empty = container.querySelector('.note-cover-thumbnail__empty')!;
      expect(empty).toBeInTheDocument();
      cleanup();
    }
  });

  it('falls back to the plus when the image fails to load', () => {
    const { container } = render(<NoteCoverThumbnail url="app://broken.png" />);

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.note-cover-thumbnail__empty')).toBeInTheDocument();
  });
});
