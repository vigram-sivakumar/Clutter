// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollectionTable } from './CollectionTable';
import { buildCollectionTableGridTemplateColumns, type CollectionTableColumn } from './collectionTableColumns';

afterEach(cleanup);

const columns: CollectionTableColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(400px, 1fr)' },
  { id: 'type', label: 'Type', width: '140px', className: 'type-header' },
];

describe('collectionTableColumns', () => {
  it('builds one grid-template-columns value from the columns, in order', () => {
    expect(buildCollectionTableGridTemplateColumns(columns)).toBe('minmax(400px, 1fr) 140px');
    expect(buildCollectionTableGridTemplateColumns([])).toBe('');
  });
});

describe('CollectionTable', () => {
  it('draws a header cell per column, in order, with the column hook class', () => {
    const { container } = render(<CollectionTable columns={columns} />);

    const cells = [...container.querySelectorAll('.cx-collection-table__header-cell')];
    expect(cells.map((cell) => cell.textContent)).toEqual(['Name', 'Type']);
    expect(cells[1]).toHaveClass('type-header');
  });

  it('puts the same grid on the header that rows are given', () => {
    const { container } = render(<CollectionTable columns={columns} />);

    expect((container.querySelector('.cx-collection-table__header') as HTMLElement).style.gridTemplateColumns).toBe(
      'minmax(400px, 1fr) 140px'
    );
  });

  it('renders its rows, then the footer, inside the body', () => {
    const { container } = render(
      <CollectionTable columns={columns} footer={<div data-testid="footer" />}>
        <div data-testid="row1" />
        <div data-testid="row2" />
      </CollectionTable>
    );

    const body = container.querySelector('.cx-collection-table__body')!;
    expect([...body.children].map((c) => c.getAttribute('data-testid'))).toEqual(['row1', 'row2', 'footer']);
    expect(screen.queryByTestId('footer')).toBeInTheDocument();
  });

  it('passes className and attributes to the container', () => {
    const { container } = render(<CollectionTable columns={columns} className="mine" data-x="1" />);

    expect(container.firstElementChild).toHaveClass('cx-collection-table', 'mine');
    expect(container.firstElementChild).toHaveAttribute('data-x', '1');
  });
});
