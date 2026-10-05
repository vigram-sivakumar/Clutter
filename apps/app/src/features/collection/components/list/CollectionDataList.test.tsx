// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionMedia } from '../media/CollectionMedia';
import { CollectionDataList, type CollectionDataListItem } from './CollectionDataList';

afterEach(cleanup);

const item = (overrides: Partial<CollectionDataListItem> = {}): CollectionDataListItem => ({
  id: 'i1',
  icon: 'note',
  title: 'Plan',
  ...overrides,
});

describe('CollectionDataList', () => {
  it('draws each item as one list row inside the list container, in order', () => {
    const { container } = render(<CollectionDataList items={[item(), item({ id: 'i2', title: 'Other' })]} />);

    const rows = container.querySelectorAll('.collection-list > .collection-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Plan');
    expect(rows[1]).toHaveTextContent('Other');
    expect(rows[0]).toHaveClass('collection-row--layout-list');
  });

  it('maps icon, emoji, title, description and titleContent onto the row', () => {
    const { container } = render(
      <CollectionDataList
        items={[
          item({ emoji: '🌊', description: 'Q4 goals' }),
          item({ id: 'i2', title: 'Hidden', titleContent: <input aria-label="Rename" /> }),
        ]}
      />
    );
    const [first, second] = [...container.querySelectorAll('.collection-row')];

    expect(first!.querySelector('.emoji-icon')).toHaveTextContent('🌊');
    expect(first!.querySelector('.collection-row__description')).toHaveTextContent('Q4 goals');
    expect(second!.querySelector('.collection-row__title input')).not.toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('leading replaces the icon with a thumbnail', () => {
    const { container } = render(
      <CollectionDataList
        items={[
          item({
            leading: <CollectionMedia><img alt="" data-testid="thumb" /></CollectionMedia>,
            description: 'Vault',
          }),
        ]}
      />
    );
    const row = container.querySelector('.collection-row')!;

    expect(row.querySelector('.collection-row__leading .collection-media [data-testid="thumb"]')).not.toBeNull();
    expect(row.querySelector('svg')).toBeNull();
  });

  it('draws each metadata value as its own span — and no metadata when there is none', () => {
    const { container } = render(
      <CollectionDataList items={[item({ metadata: ['Today', 'Yesterday'] }), item({ id: 'i2', metadata: [] })]} />
    );
    const [first, second] = [...container.querySelectorAll('.collection-row')];

    expect([...first!.querySelectorAll('.collection-row__metadata span')].map((s) => s.textContent)).toEqual([
      'Today',
      'Yesterday',
    ]);
    expect(second!.querySelector('.collection-row__metadata')).toBeNull();
  });

  it('draws media in the shared frame; a clickable one is a labelled button that does not open the row', () => {
    const onOpen = vi.fn();
    const onMedia = vi.fn();
    const { container } = render(
      <CollectionDataList
        items={[
          item({ onClick: onOpen, media: { children: <img alt="" />, onClick: onMedia, label: 'Change cover' } }),
          item({ id: 'i2', media: { children: <img alt="" /> } }),
        ]}
      />
    );

    expect(container.querySelectorAll('.collection-row__media .collection-media')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Change cover' }));
    expect(onMedia).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('marks selected items and carries extra row attributes', () => {
    const { container } = render(
      <CollectionDataList
        items={[
          item({
            isSelected: true,
            props: { 'data-resource-id': 'r1', 'aria-label': 'Plan row' },
          }),
        ]}
      />
    );
    const row = container.querySelector('.collection-row')!;

    expect(row).toHaveClass('collection-row--selected');
    expect(row).toHaveAttribute('data-resource-id', 'r1');
    expect(row).toHaveAttribute('aria-label', 'Plan row');
  });

  it('opens an item on click and on Enter; an item without onClick is inert', () => {
    const onClick = vi.fn();
    const { container } = render(<CollectionDataList items={[item({ onClick }), item({ id: 'i2' })]} />);
    const [first, second] = [...container.querySelectorAll('.collection-row')];

    fireEvent.click(first!);
    fireEvent.keyDown(first!, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(second).not.toHaveAttribute('role');
  });

  it('draws no "new" row unless asked; the new row is an action row whose label is its whole title', () => {
    const { container, rerender } = render(<CollectionDataList items={[item()]} />);
    expect(container.querySelectorAll('.collection-row')).toHaveLength(1);

    const onClick = vi.fn();
    rerender(<CollectionDataList items={[item()]} newItem={{ label: 'New Note', onClick }} />);
    const rows = container.querySelectorAll('.collection-row');
    const last = rows[rows.length - 1] as HTMLElement;

    expect(rows).toHaveLength(2);
    expect(last).toHaveClass('collection-row--tone-action');
    expect(last).toHaveTextContent('New Note');
    fireEvent.click(last);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('passes className and attributes to the container', () => {
    const { container } = render(<CollectionDataList items={[]} className="mine" data-x="1" />);

    expect(container.firstElementChild).toHaveClass('collection-list', 'mine');
    expect(container.firstElementChild).toHaveAttribute('data-x', '1');
  });
});
