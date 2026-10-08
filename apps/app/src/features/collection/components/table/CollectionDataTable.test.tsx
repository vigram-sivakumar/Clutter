// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionDataTable, type CollectionDataTableRow } from './CollectionDataTable';
import type { CollectionTableColumn } from './collectionTableColumns';

afterEach(cleanup);

const columns: CollectionTableColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(400px, 1fr)' },
  { id: 'preview', label: 'Preview', width: '80px', cellClassName: 'col-preview' },
  { id: 'type', label: 'Type', width: '140px', cellClassName: 'col-type' },
  { id: 'created', label: 'Created', width: '140px' },
];

const row = (overrides: Partial<CollectionDataTableRow> = {}): CollectionDataTableRow => ({
  id: 'r1',
  cells: {
    name: { variant: 'header', icon: 'note', title: 'Plan', description: 'Q4' },
    preview: { variant: 'media', children: <img alt="" data-testid="thumb" /> },
    type: { variant: 'text', value: 'Image' },
    created: { variant: 'text', value: 'Today', dateTime: '2026-10-05T10:00:00.000Z' },
  },
  ...overrides,
});

describe('CollectionDataTable', () => {
  it('draws the header from the columns, and a row per entry', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[row(), row({ id: 'r2' })]} />);

    expect([...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual([
      'Name',
      'Preview',
      'Type',
      'Created',
    ]);
    const rows = container.querySelectorAll('.collection-table-row');
    expect(rows).toHaveLength(2);
  });

  it('draws each cell with the variant its value names, in column order', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[row()]} />);
    const cells = [...container.querySelectorAll('.collection-table-row > .collection-table-cell')];

    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveClass('collection-table-cell--header');
    expect(cells[1]).toHaveClass('collection-table-cell--media');
    expect(cells[2]).toHaveClass('collection-table-cell--text');
    expect(cells[0]).toHaveTextContent('Plan');
    expect(cells[2]).toHaveTextContent('Image');
  });

  it('draws text cells with dateTime as data-date', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[row()]} />);

    const created = container.querySelectorAll('.collection-table-row > .collection-table-cell')[3]!;
    expect(created).toHaveAttribute('data-date', '2026-10-05T10:00:00.000Z');
    expect(created).toHaveTextContent('Today');
  });

  it('applies the column’s cellClassName to its cell in every row', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[row(), row({ id: 'r2' })]} />);

    expect(container.querySelectorAll('.collection-table-cell.col-type')).toHaveLength(2);
    expect(container.querySelectorAll('.collection-table-cell.col-preview')).toHaveLength(2);
  });

  it('a column with no value renders an empty cell, so the grid stays aligned', () => {
    const { container } = render(
      <CollectionDataTable
        columns={columns}
        rows={[row({ cells: { name: { variant: 'header', title: 'Plan' } } })]}
      />
    );
    const cells = container.querySelectorAll('.collection-table-row > *');

    expect(cells).toHaveLength(4);
    expect(cells[2]).toBeEmptyDOMElement();
    expect(cells[2]).toHaveClass('col-type');
  });

  it('draws media cells as the shared frame; a clickable one does not open the row', () => {
    const onOpen = vi.fn();
    const onMedia = vi.fn();
    render(
      <CollectionDataTable
        columns={columns}
        rows={[
          row({
            onClick: onOpen,
            cells: {
              name: { variant: 'header', title: 'Plan' },
              preview: { variant: 'media', onClick: onMedia, label: 'Change cover', children: 'x' },
            },
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change cover' }));
    expect(onMedia).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens a row on click and Enter; a row without onClick is inert', () => {
    const onClick = vi.fn();
    const { container } = render(<CollectionDataTable columns={columns} rows={[row({ onClick }), row({ id: 'r2' })]} />);
    const [first, second] = [...container.querySelectorAll('.collection-table-row')];

    fireEvent.click(first!);
    fireEvent.keyDown(first!, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(second).not.toHaveAttribute('role');
  });

  it('marks selected rows and carries extra row attributes', () => {
    const { container } = render(
      <CollectionDataTable
        columns={columns}
        rows={[
          row({
            isSelected: true,
            props: { 'data-resource-id': 'r1' },
          }),
        ]}
      />
    );
    const tableRow = container.querySelector('.collection-table-row')!;

    expect(tableRow).toHaveClass('collection-table-row--selected');
    expect(tableRow).toHaveAttribute('data-resource-id', 'r1');
  });

  it('draws no "new" row unless asked; the new row is the last, an action row spanning the table', () => {
    const { container, rerender } = render(<CollectionDataTable columns={columns} rows={[row()]} />);
    expect(container.querySelectorAll('.collection-table-row')).toHaveLength(1);

    const onClick = vi.fn();
    rerender(<CollectionDataTable columns={columns} rows={[row()]} newItem={{ label: 'New Note', onClick }} />);
    const rows = container.querySelectorAll('.collection-table-row');
    const last = rows[rows.length - 1] as HTMLElement;

    expect(rows).toHaveLength(2);
    expect(last).toHaveClass('collection-table-row--new-item');
    expect(last).toHaveTextContent('New Note');
    expect(last.querySelector('.collection-entry--new')).not.toBeNull();
    fireEvent.click(last);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('draws only the header for no rows', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[]} />);

    expect(container.querySelectorAll('.collection-table__header-cell')).toHaveLength(4);
    expect(container.querySelectorAll('.collection-table-row')).toHaveLength(0);
  });
});
