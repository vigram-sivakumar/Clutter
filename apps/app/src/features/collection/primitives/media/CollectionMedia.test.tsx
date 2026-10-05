// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollectionMedia } from './CollectionMedia';

afterEach(cleanup);

describe('CollectionMedia', () => {
  it('frames whatever it is given', () => {
    render(
      <CollectionMedia>
        <img alt="" data-testid="inside" />
      </CollectionMedia>
    );

    expect(screen.getByTestId('inside').closest('.cx-collection-media')).not.toBeNull();
  });

  it('is purely visual: hidden from assistive tech, and never a button', () => {
    const { container } = render(<CollectionMedia>x</CollectionMedia>);
    const frame = container.firstElementChild!;

    expect(frame.tagName).toBe('DIV');
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fillHeight marks the frame to fill its host', () => {
    const { container, rerender } = render(<CollectionMedia>x</CollectionMedia>);
    expect(container.firstElementChild).not.toHaveClass('cx-collection-media--fill-height');

    rerender(<CollectionMedia fillHeight>x</CollectionMedia>);
    expect(container.firstElementChild).toHaveClass('cx-collection-media', 'cx-collection-media--fill-height');
  });
});
