// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectionTableColumn } from './collectionTableColumns';
import { CollectionDataTable, type CollectionDataTableRow } from './CollectionDataTable';

afterEach(cleanup);

const columns: CollectionTableColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(100px, 1fr)', className: 'h-name', cellClassName: 'c-name' },
  { id: 'created', label: 'Created', width: '90px', cellClassName: 'c-created' },
  { id: 'preview', label: 'Preview', width: '50px', cellClassName: 'c-preview' },
  { id: 'type', label: 'Type', width: '70px', cellClassName: 'c-type' },
];

const row = (overrides: Partial<CollectionDataTableRow> = {}): CollectionDataTableRow => ({
  id: 'r1',
  cells: {
    name: { kind: 'header', icon: 'note', title: 'Plan', description: 'Q4' },
    created: { kind: 'date', value: 'Today', dateTime: '2026-10-03' },
    preview: { kind: 'asset', children: <i /> },
    type: { kind: 'text', value: 'PDF' },
  },
  ...overrides,
});

describe('CollectionDataTable', () => {
  it('draws each column\'s cell with the generic cell its value names, applying the column\'s cell class', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[row()]} />);

    const r = container.querySelector('.collection-table-row')!;
    const cells = [...r.children];
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveClass('collection-table-cell--header', 'collection-table-row__entry', 'c-name');
    expect(cells[1]).toHaveClass('collection-table-cell--date', 'c-created');
    expect(cells[2]).toHaveClass('collection-table-cell--asset', 'c-preview');
    expect(cells[3]).toHaveClass('collection-table-cell--text', 'c-type');
  });

  it('builds the header and every row from the same columns, so they share one grid', () => {
    const { container } = render(<CollectionDataTable columns={columns} rows={[row(), row({ id: 'r2' })]} />);

    const expected = 'minmax(100px, 1fr) 90px 50px 70px';
    expect((container.querySelector('.collection-table__header') as HTMLElement).style.gridTemplateColumns).toBe(expected);
    for (const r of container.querySelectorAll<HTMLElement>('.collection-table-row')) {
      expect(r.style.gridTemplateColumns).toBe(expected);
    }
    expect([...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual([
      'Name',
      'Created',
      'Preview',
      'Type',
    ]);
  });

  it('renders an empty cell for a column the row has no value for, so the grid stays aligned', () => {
    const { container } = render(
      <CollectionDataTable
        columns={columns}
        rows={[{ id: 'r', cells: { name: { kind: 'header', title: 'Only name' } } }]}
      />
    );

    const r = container.querySelector('.collection-table-row')!;
    expect(r.children).toHaveLength(4);
    expect(r.children[1]).toHaveClass('c-created');
  });

  it('opens the row on click, hosts the actions overlay, and carries data attributes', () => {
    const onClick = vi.fn();
    const { container, getByText } = render(
      <CollectionDataTable
        columns={columns}
        rows={[row({ onClick, actions: <button>Restore</button>, props: { 'data-resource-id': 'abc' } })]}
      />
    );

    const r = container.querySelector('.collection-table-row')!;
    expect(r).toHaveAttribute('data-resource-id', 'abc');
    expect(r.querySelector('.collection-table-row__actions')).toContainElement(getByText('Restore'));

    fireEvent.click(getByText('Plan'));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Restore'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders rows then the footer inside the body, and no footer unless given', () => {
    const withFooter = render(
      <CollectionDataTable columns={columns} rows={[row()]} footer={<div data-testid="footer" />} />
    );
    const body = withFooter.container.querySelector('.collection-table__body')!;
    expect([...body.children].map((c) => c.getAttribute('data-testid') ?? 'row')).toEqual(['row', 'footer']);
    cleanup();

    const without = render(<CollectionDataTable columns={columns} rows={[]} />);
    expect(without.container.querySelector('.collection-table__body')!.children).toHaveLength(0);
  });
});
