// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppIcon } from '@shared/icon';
import { CollectionEntry } from './CollectionEntry';

afterEach(cleanup);

const entry = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CollectionEntry — slots', () => {
  it('draws the title, and titleContent in its place', () => {
    const { rerender } = render(<CollectionEntry title="Plan" />);
    expect(screen.getByText('Plan')).toHaveClass('collection-entry__title');

    rerender(<CollectionEntry title="Hidden" titleContent={<input aria-label="Rename" />} />);
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByLabelText('Rename').closest('.collection-entry__title')).not.toBeNull();
  });

  it('leading is a slot: an AppIcon (or its emoji) or any node, drawn before the content — and absent without one', () => {
    const { container, rerender } = render(<CollectionEntry title="Plan" leading={<AppIcon icon="note" />} />);
    expect(container.querySelector('.collection-entry__leading svg')).not.toBeNull();

    rerender(<CollectionEntry title="Plan" leading={<AppIcon emoji="🌊" />} />);
    expect(container.querySelector('.collection-entry__leading .emoji-icon')).toHaveTextContent('🌊');

    rerender(<CollectionEntry title="Plan" leading={<span data-testid="thumb" />} />);
    expect(container.querySelector('.collection-entry__leading [data-testid="thumb"]')).not.toBeNull();

    rerender(<CollectionEntry title="Plan" />);
    expect(container.querySelector('.collection-entry__leading')).toBeNull();
  });

  it('draws the description line only when there is one', () => {
    const { container, rerender } = render(<CollectionEntry title="Plan" description="Q4 goals" />);
    expect(container.querySelector('.collection-entry__description')).toHaveTextContent('Q4 goals');

    rerender(<CollectionEntry title="Plan" />);
    expect(container.querySelector('.collection-entry__description')).toBeNull();
  });

  it('trailing is a slot for everything else, and absent without one', () => {
    const { container, rerender } = render(
      <CollectionEntry title="Plan" trailing={<><span>Today</span><span>12 KB</span></>} />
    );
    expect([...container.querySelectorAll('.collection-entry__trailing > span')].map((s) => s.textContent)).toEqual([
      'Today',
      '12 KB',
    ]);

    rerender(<CollectionEntry title="Plan" />);
    expect(container.querySelector('.collection-entry__trailing')).toBeNull();
  });
});

describe('CollectionEntry — layouts and state', () => {
  it('list is the default layout; cell is the table\'s name cell', () => {
    const { container, rerender } = render(<CollectionEntry title="Plan" />);
    expect(entry(container)).toHaveClass('collection-entry', 'collection-entry--layout-list');

    rerender(<CollectionEntry title="Plan" layout="cell" />);
    expect(entry(container)).toHaveClass('collection-entry--layout-cell');
    expect(entry(container)).not.toHaveClass('collection-entry--layout-list');
  });

  it('marks a selected entry with one class', () => {
    const { container, rerender } = render(<CollectionEntry title="Plan" isSelected />);
    expect(entry(container)).toHaveClass('collection-entry--selected');

    rerender(<CollectionEntry title="Plan" />);
    expect(entry(container)).not.toHaveClass('collection-entry--selected');
  });

  it('forwards ref, merges className and passes attributes through', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <CollectionEntry ref={ref} title="Plan" className="mine" data-resource-id="r1" aria-label="Plan entry" />
    );

    expect(ref.current).toBe(entry(container));
    expect(entry(container)).toHaveClass('collection-entry', 'mine');
    expect(entry(container)).toHaveAttribute('data-resource-id', 'r1');
    expect(entry(container)).toHaveAttribute('aria-label', 'Plan entry');
  });
});

describe('CollectionEntry — interaction', () => {
  it('is inert without onClick: no role, not focusable', () => {
    const { container } = render(<CollectionEntry title="Plan" />);

    expect(entry(container)).not.toHaveAttribute('role');
    expect(entry(container)).not.toHaveAttribute('tabindex');
  });

  it('with onClick it is one focusable button that opens on click, Enter and Space', () => {
    const onClick = vi.fn();
    const { container } = render(<CollectionEntry title="Plan" onClick={onClick} />);

    expect(entry(container)).toHaveAttribute('role', 'button');
    expect(entry(container)).toHaveAttribute('tabindex', '0');

    fireEvent.click(entry(container));
    fireEvent.keyDown(entry(container), { key: 'Enter' });
    fireEvent.keyDown(entry(container), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('a nested control (a clickable thumbnail) keeps its own click and does not open the entry', () => {
    const onOpen = vi.fn();
    const onThumb = vi.fn();
    render(
      <CollectionEntry
        title="Plan"
        onClick={onOpen}
        trailing={<button type="button" onClick={onThumb}>Change cover</button>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change cover' }));
    expect(onThumb).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lets a caller override the role', () => {
    const { container } = render(<CollectionEntry title="Plan" onClick={() => {}} role="link" />);

    expect(entry(container)).toHaveAttribute('role', 'link');
    expect(createEvent.click(entry(container))).toBeTruthy();
  });
});
