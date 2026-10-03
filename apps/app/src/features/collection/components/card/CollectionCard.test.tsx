// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionCard } from './CollectionCard';
import { CollectionCardGrid } from './CollectionCardGrid';

afterEach(cleanup);

describe('CollectionCard (the shell every collection card shares)', () => {
  it('is one focusable open target: role=button, tabIndex 0', () => {
    const { container } = render(<CollectionCard>x</CollectionCard>);

    const card = container.firstElementChild!;
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).toHaveClass('collection-card');
  });

  it('click and Enter/Space on the card itself open it; keys inside a descendant do not', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CollectionCard onClick={onClick}>
        <span data-testid="inner">x</span>
      </CollectionCard>
    );
    const card = container.firstElementChild!;

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);

    onClick.mockClear();
    fireEvent.keyDown(container.querySelector('[data-testid="inner"]')!, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks selected and compact (no fixed shape) cards', () => {
    const { container } = render(
      <CollectionCard isSelected compact>
        x
      </CollectionCard>
    );

    expect(container.firstElementChild).toHaveClass('collection-card--selected', 'collection-card--compact');
  });

  it('knows nothing about notes or assets', () => {
    const { container } = render(<CollectionCard>x</CollectionCard>);

    expect(container.firstElementChild!.className).toBe('collection-card');
  });
});

describe('CollectionCardGrid', () => {
  it('is a plain grid container for any collection’s cards', () => {
    const { container } = render(
      <CollectionCardGrid className="custom">
        <div>a</div>
      </CollectionCardGrid>
    );

    expect(container.firstElementChild).toHaveClass('collection-card-grid', 'custom');
  });
});
