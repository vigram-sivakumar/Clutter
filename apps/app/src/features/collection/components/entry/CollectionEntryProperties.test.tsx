// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionEntryProperties } from './CollectionEntryProperties';

afterEach(cleanup);

describe('CollectionEntryProperties — one value', () => {
  it('draws whatever it is given in its own element', () => {
    const { container } = render(<CollectionEntryProperties>12 September, 09:03 AM</CollectionEntryProperties>);

    expect(container.firstElementChild).toHaveClass('collection-entry-properties');
    expect(container.firstElementChild).toHaveTextContent('12 September, 09:03 AM');
  });

  it('one per value: siblings stay separate elements', () => {
    const { container } = render(
      <>
        <CollectionEntryProperties>5 Oct</CollectionEntryProperties>
        <CollectionEntryProperties>12 KB</CollectionEntryProperties>
      </>
    );

    expect([...container.querySelectorAll('.collection-entry-properties')].map((el) => el.textContent)).toEqual([
      '5 Oct',
      '12 KB',
    ]);
  });

  it('draws an optional leading (an AppIcon, say) before the value', () => {
    const { container, rerender } = render(
      <CollectionEntryProperties leading={<span data-testid="icon" />}>Trip planning</CollectionEntryProperties>
    );
    const [leading, text] = [...(container.firstElementChild as HTMLElement).childNodes];

    expect((leading as HTMLElement).className).toBe('collection-entry-properties__leading');
    expect((leading as HTMLElement).querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(text).toHaveTextContent('Trip planning');

    rerender(<CollectionEntryProperties>Trip planning</CollectionEntryProperties>);
    expect(container.querySelector('.collection-entry-properties__leading')).toBeNull();
  });

  it('forwards ref, merges className and passes attributes through', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <CollectionEntryProperties ref={ref} className="mine" data-date="2026-09-12T09:03:00.000Z">
        x
      </CollectionEntryProperties>
    );

    expect(ref.current).toBe(container.firstElementChild);
    expect(container.firstElementChild).toHaveClass('collection-entry-properties', 'mine');
    expect(container.firstElementChild).toHaveAttribute('data-date', '2026-09-12T09:03:00.000Z');
  });
});

describe('CollectionEntryProperties — a clickable value', () => {
  it('is inert without onClick: no role, not focusable', () => {
    const { container } = render(<CollectionEntryProperties>5 Oct</CollectionEntryProperties>);

    expect(container.firstElementChild).not.toHaveAttribute('role');
    expect(container.firstElementChild).not.toHaveAttribute('tabindex');
  });

  it('with onClick it is one focusable button that opens on click, Enter and Space', () => {
    const onClick = vi.fn();
    render(
      <CollectionEntryProperties className="collection-entry-properties--action" onClick={onClick}>
        9 Oct 2026
      </CollectionEntryProperties>
    );
    const value = screen.getByRole('button', { name: '9 Oct 2026' });

    expect(value).toHaveAttribute('tabindex', '0');
    fireEvent.click(value);
    fireEvent.keyDown(value, { key: 'Enter' });
    fireEvent.keyDown(value, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('lets a caller override the role (the wiki link is a link)', () => {
    render(<CollectionEntryProperties role="link" onClick={() => {}}>Trips</CollectionEntryProperties>);

    expect(screen.getByRole('link', { name: 'Trips' })).toHaveAttribute('tabindex', '0');
  });
});
