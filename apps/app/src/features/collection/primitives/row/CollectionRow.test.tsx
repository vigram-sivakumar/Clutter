// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionRow } from './CollectionRow';

afterEach(cleanup);

const row = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CollectionRow — content', () => {
  it('draws the icon through AppIcon, or the emoji instead when set', () => {
    const { container, rerender } = render(<CollectionRow icon="note" title="Plan" />);
    expect(container.querySelector('.cx-collection-row__leading svg')).not.toBeNull();

    rerender(<CollectionRow icon="note" emoji="🌊" title="Plan" />);
    expect(container.querySelector('.cx-collection-row__leading .emoji-icon')).toHaveTextContent('🌊');
    expect(container.querySelector('.cx-collection-row__leading svg')).toBeNull();
  });

  it('has no leading box without an icon or emoji', () => {
    const { container } = render(<CollectionRow title="Plan" />);

    expect(container.querySelector('.cx-collection-row__leading')).toBeNull();
  });

  it('renders the title, and titleContent in its place', () => {
    const { rerender } = render(<CollectionRow title="Plan" />);
    expect(screen.getByText('Plan')).toHaveClass('cx-collection-row__title');

    rerender(<CollectionRow title="Plan" titleContent={<input aria-label="Rename" />} />);
    expect(screen.getByLabelText('Rename').parentElement).toHaveClass('cx-collection-row__title');
    expect(screen.queryByText('Plan')).toBeNull();
  });

  it('renders the description, or the placeholder (muted) when it is empty', () => {
    const { rerender } = render(<CollectionRow title="Plan" description="Q4" descriptionPlaceholder="No description" />);
    expect(screen.getByText('Q4')).not.toHaveClass('cx-collection-row__description--placeholder');
    expect(screen.queryByText('No description')).toBeNull();

    rerender(<CollectionRow title="Plan" description="" descriptionPlaceholder="No description" />);
    expect(screen.getByText('No description')).toHaveClass(
      'cx-collection-row__description',
      'cx-collection-row__description--placeholder'
    );

    rerender(<CollectionRow title="Plan" description="" />);
    expect(document.querySelector('.cx-collection-row__description')).toBeNull();
  });
});

describe('CollectionRow — layouts', () => {
  it('list is the default; metadata and media trail the content', () => {
    const { container } = render(
      <CollectionRow title="Plan" metadata={<span>Today</span>} media={<img alt="" data-testid="thumb" />} />
    );

    expect(row(container)).toHaveClass('cx-collection-row--layout-list');
    const trailing = container.querySelector('.cx-collection-row__trailing')!;
    expect(trailing.querySelector('.cx-collection-row__metadata')).toHaveTextContent('Today');
    expect(trailing.querySelector('.cx-collection-row__media [data-testid="thumb"]')).not.toBeNull();
  });

  it('cell: metadata sits in the content column and media is not drawn', () => {
    const { container } = render(
      <CollectionRow layout="cell" title="Plan" metadata={<span>Today</span>} media={<img alt="" data-testid="thumb" />} />
    );

    expect(row(container)).toHaveClass('cx-collection-row--layout-cell');
    expect(container.querySelector('.cx-collection-row__trailing')).toBeNull();
    expect(container.querySelector('.cx-collection-row__content > .cx-collection-row__metadata')).toHaveTextContent('Today');
    expect(screen.queryByTestId('thumb')).toBeNull();
  });

  it('tone defaults to default and can be action', () => {
    const { container, rerender } = render(<CollectionRow title="Plan" />);
    expect(row(container)).toHaveClass('cx-collection-row--tone-default');

    rerender(<CollectionRow title="Plan" tone="action" />);
    expect(row(container)).toHaveClass('cx-collection-row--tone-action');
  });
});

describe('CollectionRow — state and slots', () => {
  it('marks a selected row', () => {
    const { container, rerender } = render(<CollectionRow title="Plan" />);
    expect(row(container)).not.toHaveClass('cx-collection-row--selected');

    rerender(<CollectionRow title="Plan" isSelected />);
    expect(row(container)).toHaveClass('cx-collection-row--selected');
  });

  it('draws the actions slot', () => {
    const { container } = render(<CollectionRow title="Plan" actions={<button type="button">Restore</button>} />);

    expect(container.querySelector('.cx-collection-row__actions button')).toHaveTextContent('Restore');
  });

  it('forwards ref, className and attributes', () => {
    const ref = { current: null as HTMLDivElement | null };
    const { container } = render(<CollectionRow ref={ref} title="Plan" className="mine" data-resource-id="r1" />);

    expect(ref.current).toBe(row(container));
    expect(row(container)).toHaveClass('cx-collection-row', 'mine');
    expect(row(container)).toHaveAttribute('data-resource-id', 'r1');
  });
});

describe('CollectionRow — interaction', () => {
  it('is inert without onClick', () => {
    const { container } = render(<CollectionRow title="Plan" />);

    expect(row(container)).not.toHaveAttribute('role');
    expect(row(container)).not.toHaveAttribute('tabindex');
  });

  it('with onClick it is one focusable button that opens on click, Enter and Space', () => {
    const onClick = vi.fn();
    const { container } = render(<CollectionRow title="Plan" onClick={onClick} />);

    expect(row(container)).toHaveAttribute('role', 'button');
    expect(row(container)).toHaveAttribute('tabindex', '0');
    fireEvent.click(row(container));
    fireEvent.keyDown(row(container), { key: 'Enter' });
    fireEvent.keyDown(row(container), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('a nested control (actions, a clickable thumbnail) keeps its own click', () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <CollectionRow
        title="Plan"
        onClick={onClick}
        actions={<button type="button" onClick={onAction}>Restore</button>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
