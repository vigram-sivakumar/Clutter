// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionDataList, type CollectionDataListItem } from './CollectionDataList';

afterEach(cleanup);

const item = (overrides: Partial<CollectionDataListItem> = {}): CollectionDataListItem => ({
  id: 'i1',
  icon: 'note',
  title: 'Plan',
  ...overrides,
});

describe('CollectionDataList', () => {
  it('draws each item as one shared list row inside the shared list grid', () => {
    const { container, getByText } = render(
      <CollectionDataList items={[item(), item({ id: 'i2', title: 'Other' })]} />
    );

    const rows = container.querySelectorAll('.collection-list-grid > .collection-list-row');
    expect(rows).toHaveLength(2);
    expect(getByText('Plan').closest('.collection-list-row')).toBe(rows[0]);
    expect(rows[0]!.querySelector('.collection-entry__icon')).not.toBeNull();
  });

  it('renders description, emoji and each metadata value as its own span — and no metadata when there is none', () => {
    const { container, getByText } = render(
      <CollectionDataList
        items={[item({ emoji: '🌊', description: 'Q4 goals', metadata: ['Today', 'Yesterday'] }), item({ id: 'i2', metadata: [] })]}
      />
    );

    const [first, second] = [...container.querySelectorAll('.collection-list-row')];
    expect(getByText('Q4 goals')).toHaveClass('collection-entry__description');
    expect(first!.querySelector('.collection-entry__emoji')).not.toBeNull();
    expect([...first!.querySelectorAll('.collection-entry__metadata span')].map((s) => s.textContent)).toEqual([
      'Today',
      'Yesterday',
    ]);
    expect(second!.querySelector('.collection-entry__metadata')).toBeNull();
  });

  it('opens an item on click, hosts its actions, marks selection, and carries data attributes', () => {
    const onClick = vi.fn();
    const { container, getByText } = render(
      <CollectionDataList
        items={[
          item({
            onClick,
            isSelected: true,
            actions: <button>Restore</button>,
            props: { 'data-resource-id': 'abc' },
          }),
        ]}
      />
    );

    const row = container.querySelector('.collection-list-row')!;
    expect(row).toHaveAttribute('data-resource-id', 'abc');
    expect(row).toHaveClass('collection-entry--selected');
    expect(row.querySelector('.collection-entry__actions')).toContainElement(getByText('Restore'));

    fireEvent.click(getByText('Plan'));
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('Restore'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('draws an item\'s media in the shared thumbnail frame at the row\'s trailing end, after its metadata (the dates)', () => {
    const onClick = vi.fn();
    const rowClick = vi.fn();
    const { container, getByLabelText } = render(
      <CollectionDataList
        items={[
          item({
            onClick: rowClick,
            metadata: ['Today'],
            actions: <button>Restore</button>,
            media: { children: <img alt="" src="app://x.png" />, onClick, label: 'Change cover image' },
          }),
          item({ id: 'i2', media: { children: <i data-testid="visual" /> } }),
          item({ id: 'i3' }),
        ]}
      />
    );

    const [withButton, visual, none] = [...container.querySelectorAll('.collection-list-row')];
    const slot = withButton!.querySelector('.collection-entry__media')!;
    expect(slot.querySelector('button.collection-media')).toBe(getByLabelText('Change cover image'));
    expect(withButton!.querySelector('.collection-entry__content')).not.toContainElement(slot as HTMLElement);
    expect(slot.parentElement).toHaveClass('collection-entry__metadata');
    expect(slot.previousElementSibling).toHaveTextContent('Today');
    expect(slot.parentElement!.nextElementSibling).toHaveClass('collection-entry__actions');

    // A purely visual thumbnail is hidden from assistive tech; an item without media has no slot.
    expect(visual!.querySelector('.collection-entry__media .collection-media')).toHaveAttribute('aria-hidden', 'true');
    expect(none!.querySelector('.collection-entry__media')).toBeNull();

    // Clicking the thumbnail does its own thing — it never opens the row.
    fireEvent.click(getByLabelText('Change cover image'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('replaces the title with titleContent (an inline rename editor)', () => {
    const { getByTestId, queryByText } = render(
      <CollectionDataList items={[item({ titleContent: <input data-testid="rename" /> })]} />
    );

    expect(getByTestId('rename')).toBeInTheDocument();
    expect(queryByText('Plan')).toBeNull();
  });

  it('ends with a "New …" row only when given one, and it fires its handler', () => {
    const onClick = vi.fn();
    const withNew = render(<CollectionDataList items={[item()]} newItem={{ label: 'New Note', onClick }} />);
    const grid = withNew.container.querySelector('.collection-list-grid')!;
    const last = grid.lastElementChild!;
    expect(last).toHaveClass('collection-list-grid__new-item');
    expect(last).toHaveTextContent('New Note');

    fireEvent.click(last);
    expect(onClick).toHaveBeenCalledTimes(1);
    cleanup();

    const without = render(<CollectionDataList items={[item()]} />);
    expect(without.container.querySelector('.collection-list-grid__new-item')).toBeNull();
  });

  it('forwards container props (the Assets body\'s F2 handler) to the grid', () => {
    const onKeyDown = vi.fn();
    const { container } = render(<CollectionDataList items={[item()]} onKeyDown={onKeyDown} />);

    fireEvent.keyDown(container.querySelector('.collection-list-row')!, { key: 'F2' });
    expect(onKeyDown).toHaveBeenCalled();
  });
});
