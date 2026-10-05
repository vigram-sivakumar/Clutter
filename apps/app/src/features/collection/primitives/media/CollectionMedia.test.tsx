// @vitest-environment jsdom

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

    expect(screen.getByTestId('inside').closest('.cx-collection-media')).not.toBeNull();
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
    expect(button).toHaveClass('cx-collection-media--interactive');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(currentTarget).toBe(button);
  });
});
