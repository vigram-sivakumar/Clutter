// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionTableCell } from './CollectionTableCell';

afterEach(cleanup);

const cell = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CollectionTableCell — header variant', () => {
  it('is the row’s name cell: a cell-layout row with icon, title and description', () => {
    const { container } = render(
      <CollectionTableCell
        variant="header"
        icon="note"
        title="Plan"
        description="Q4 goals"
        className="col-name"
      />
    );

    expect(cell(container)).toHaveClass(
      'collection-entry',
      'collection-entry--layout-cell',
      'collection-table-cell',
      'collection-table-cell--header',
      'col-name'
    );
    expect(cell(container).querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Q4 goals')).toBeInTheDocument();
  });

  it('draws an emoji, a titleContent editor and the description placeholder', () => {
    const { container, rerender } = render(
      <CollectionTableCell variant="header" emoji="🌊" titleContent={<input aria-label="Rename" />} />
    );
    expect(container.querySelector('.emoji-icon')).toHaveTextContent('🌊');
    expect(screen.getByLabelText('Rename')).toBeInTheDocument();

    rerender(<CollectionTableCell variant="header" title="Plan" descriptionPlaceholder="No description" />);
    expect(screen.getByText('No description')).toHaveClass('collection-entry__description');
  });

  it('can show a thumbnail in place of the icon (leading), keeping the title and description', () => {
    const { container } = render(
      <CollectionTableCell
        variant="header"
        icon="note"
        leading={<span className="collection-media" data-testid="thumb" />}
        title="photo.png"
        description="4 MB"
      />
    );

    expect(cell(container).querySelector('.collection-entry__leading [data-testid="thumb"]')).not.toBeNull();
    expect(cell(container).querySelector('svg')).toBeNull();
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('4 MB')).toBeInTheDocument();
  });

  it('is inert: the table row, not the cell, opens', () => {
    const { container } = render(<CollectionTableCell variant="header" title="Plan" />);

    expect(cell(container)).not.toHaveAttribute('role');
  });
});

describe('CollectionTableCell — custom variant', () => {
  it('draws any node (a control, a link) as one value, in its own CollectionEntryProperties', () => {
    const { container } = render(
      <CollectionTableCell variant="custom" className="col-due">
        <button type="button">Add due date</button>
      </CollectionTableCell>
    );

    expect(cell(container)).toHaveClass('collection-table-cell', 'collection-table-cell--custom', 'col-due');
    expect(cell(container).querySelector('.collection-entry-properties > button')).toHaveTextContent('Add due date');
  });
});

describe('every value cell draws its value in a CollectionEntryProperties', () => {
  it('text, media and custom alike', () => {
    for (const props of [
      { variant: 'text' as const, value: 'Image' },
      { variant: 'media' as const, children: <img alt="" /> },
      { variant: 'custom' as const, children: <span>x</span> },
    ]) {
      const { container } = render(<CollectionTableCell {...props} />);

      expect(cell(container).firstElementChild, props.variant).toHaveClass('collection-entry-properties');
      cleanup();
    }
  });
});

describe('CollectionTableCell — text variant', () => {
  it('draws one muted line of text', () => {
    const { container } = render(<CollectionTableCell variant="text" value="Image" className="col-type" />);

    expect(cell(container)).toHaveClass('collection-table-cell', 'collection-table-cell--text', 'col-type');
    expect(cell(container)).toHaveTextContent('Image');
  });

  it('exposes the instant a date value stands for as data-date, without drawing it', () => {
    const { container } = render(
      <CollectionTableCell variant="text" value="Today" dateTime="2026-10-05T10:00:00.000Z" />
    );

    expect(cell(container)).toHaveAttribute('data-date', '2026-10-05T10:00:00.000Z');
    expect(cell(container)).toHaveTextContent(/^Today$/);
  });

  it('with no value it is an empty cell that still exists (the grid stays aligned), and has no data-date', () => {
    const { container } = render(<CollectionTableCell variant="text" />);

    expect(cell(container)).toBeEmptyDOMElement();
    expect(cell(container)).not.toHaveAttribute('data-date');
  });
});

describe('CollectionTableCell — media variant', () => {
  it('frames its children in the shared media frame', () => {
    const { container } = render(
      <CollectionTableCell variant="media" className="col-cover">
        <img alt="" data-testid="thumb" />
      </CollectionTableCell>
    );

    expect(cell(container)).toHaveClass('collection-table-cell', 'collection-table-cell--media', 'col-cover');
    expect(cell(container).querySelector('.collection-media [data-testid="thumb"]')).not.toBeNull();
    expect(cell(container).querySelector('.collection-media')).toHaveAttribute('aria-hidden', 'true');
  });

  it('with onClick the frame is a labelled button', () => {
    const onClick = vi.fn();
    render(
      <CollectionTableCell variant="media" onClick={onClick} label="Change cover image">
        x
      </CollectionTableCell>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change cover image' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
