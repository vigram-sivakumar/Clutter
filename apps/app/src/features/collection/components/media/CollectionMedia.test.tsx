// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionMedia } from './CollectionMedia';

afterEach(cleanup);

describe('CollectionMedia', () => {
  it('frames whatever it is given', () => {
    render(
      <CollectionMedia>
        <img alt="" data-testid="inside" />
      </CollectionMedia>
    );

    expect(screen.getByTestId('inside').closest('.collection-media')).not.toBeNull();
  });

  it('without onClick it is a purely visual frame, hidden from assistive tech', () => {
    const { container } = render(<CollectionMedia label="ignored">x</CollectionMedia>);
    const frame = container.firstElementChild!;

    expect(frame.tagName).toBe('DIV');
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    expect(frame).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with onClick it is a labelled button', () => {
    let currentTarget: EventTarget | null = null;
    const onClick = vi.fn((event: { currentTarget: EventTarget }) => {
      currentTarget = event.currentTarget;
    });
    render(
      <CollectionMedia onClick={onClick} label="Change cover">
        x
      </CollectionMedia>
    );

    const button = screen.getByRole('button', { name: 'Change cover' });
    expect(button).toHaveClass('collection-media--interactive');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(currentTarget).toBe(button);
  });

  it('has no size props: the parent sizes it through custom properties (default 20 × 20)', () => {
    const css = readFileSync(join(__dirname, 'CollectionMedia.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(css).toMatch(/width:\s*var\(--collection-media-width,\s*var\(--space-20\)\)/);
    expect(css).toMatch(/height:\s*var\(--collection-media-height,\s*var\(--space-20\)\)/);
  });
});
