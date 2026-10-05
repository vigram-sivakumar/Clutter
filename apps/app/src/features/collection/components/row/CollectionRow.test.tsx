// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionRow } from './CollectionRow';

afterEach(cleanup);

const row = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CollectionRow — content', () => {
  it('draws the icon through AppIcon, or the emoji instead when set', () => {
    const { container, rerender } = render(<CollectionRow icon="note" title="Plan" />);
    expect(container.querySelector('.collection-row__leading svg')).not.toBeNull();

    rerender(<CollectionRow icon="note" emoji="🌊" title="Plan" />);
    expect(container.querySelector('.collection-row__leading .emoji-icon')).toHaveTextContent('🌊');
    expect(container.querySelector('.collection-row__leading svg')).toBeNull();
  });

  it('leading replaces the icon and emoji with whatever it is given (a thumbnail), at its own size', () => {
    const { container } = render(
      <CollectionRow icon="note" emoji="🌊" title="Plan" leading={<img alt="" data-testid="thumb" />} />
    );

    const leading = container.querySelector('.collection-row__leading')!;
    expect(leading).toHaveClass('collection-row__leading--custom');
    expect(leading.querySelector('[data-testid="thumb"]')).not.toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.emoji-icon')).toBeNull();
  });

  it('a thumbnail in the leading slot is 24px wide and takes the row height (a 24px square in a one-line row)', () => {
    const css = readFileSync(join(__dirname, 'CollectionRow.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.collection-row__leading--custom\s*\{([^}]*)\}/)![1]!;

    expect(rule).toMatch(/--collection-media-width:\s*var\(--space-24\)/);
    expect(rule).toMatch(/--collection-media-height:\s*auto/);
    expect(rule).toMatch(/align-self:\s*stretch/);
  });

  it('has no leading box without an icon or emoji', () => {
    const { container } = render(<CollectionRow title="Plan" />);

    expect(container.querySelector('.collection-row__leading')).toBeNull();
  });

  it('renders the title, and titleContent in its place', () => {
    const { rerender } = render(<CollectionRow title="Plan" />);
    expect(screen.getByText('Plan')).toHaveClass('collection-row__title');

    rerender(<CollectionRow title="Plan" titleContent={<input aria-label="Rename" />} />);
    expect(screen.getByLabelText('Rename').parentElement).toHaveClass('collection-row__title');
    expect(screen.queryByText('Plan')).toBeNull();
  });

  it('renders the description, or the placeholder (muted) when it is empty', () => {
    const { rerender } = render(<CollectionRow title="Plan" description="Q4" descriptionPlaceholder="No description" />);
    expect(screen.getByText('Q4')).not.toHaveClass('collection-row__description--placeholder');
    expect(screen.queryByText('No description')).toBeNull();

    rerender(<CollectionRow title="Plan" description="" descriptionPlaceholder="No description" />);
    expect(screen.getByText('No description')).toHaveClass(
      'collection-row__description',
      'collection-row__description--placeholder'
    );

    rerender(<CollectionRow title="Plan" description="" />);
    expect(document.querySelector('.collection-row__description')).toBeNull();
  });
});

describe('CollectionRow — layouts', () => {
  it('list is the default; metadata and media trail the content', () => {
    const { container } = render(
      <CollectionRow title="Plan" metadata={<span>Today</span>} media={<img alt="" data-testid="thumb" />} />
    );

    expect(row(container)).toHaveClass('collection-row--layout-list');
    const trailing = container.querySelector('.collection-row__trailing')!;
    expect(trailing.querySelector('.collection-row__metadata')).toHaveTextContent('Today');
    expect(trailing.querySelector('.collection-row__media [data-testid="thumb"]')).not.toBeNull();
  });

  it('cell: stacks the title over the description; metadata and media are not drawn', () => {
    const { container } = render(
      <CollectionRow
        layout="cell"
        icon="note"
        title="Plan"
        description="Q4"
        metadata={<span>Today</span>}
        media={<img alt="" data-testid="thumb" />}
      />
    );

    expect(row(container)).toHaveClass('collection-row--layout-cell');
    expect(container.querySelector('.collection-row__trailing')).toBeNull();
    expect(container.querySelector('.collection-row__metadata')).toBeNull();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByTestId('thumb')).toBeNull();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Q4')).toBeInTheDocument();
  });

  it('cell: the icon is aligned to the title row, not centred on the whole cell', () => {
    const css = readFileSync(join(__dirname, 'CollectionRow.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(css).toMatch(/\.collection-row--layout-cell\s*\{\s*align-items:\s*flex-start/);
  });

  it('tone defaults to default and can be action', () => {
    const { container, rerender } = render(<CollectionRow title="Plan" />);
    expect(row(container)).toHaveClass('collection-row--tone-default');

    rerender(<CollectionRow title="Plan" tone="action" />);
    expect(row(container)).toHaveClass('collection-row--tone-action');
  });
});

describe('CollectionRow — state and slots', () => {
  it('marks a selected row', () => {
    const { container, rerender } = render(<CollectionRow title="Plan" />);
    expect(row(container)).not.toHaveClass('collection-row--selected');

    rerender(<CollectionRow title="Plan" isSelected />);
    expect(row(container)).toHaveClass('collection-row--selected');
  });

  it('forwards ref, className and attributes', () => {
    const ref = { current: null as HTMLDivElement | null };
    const { container } = render(<CollectionRow ref={ref} title="Plan" className="mine" data-resource-id="r1" />);

    expect(ref.current).toBe(row(container));
    expect(row(container)).toHaveClass('collection-row', 'mine');
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

  it('a nested control (a clickable thumbnail) keeps its own click', () => {
    const onClick = vi.fn();
    const onNested = vi.fn();
    render(
      <CollectionRow
        title="Plan"
        onClick={onClick}
        media={<button type="button" onClick={onNested}>Thumb</button>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Thumb' }));
    expect(onNested).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
