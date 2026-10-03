// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCollectionTableGridTemplateColumns } from './collectionTableColumns';
import { CollectionTable } from './CollectionTable';
import { CollectionTableRow } from './CollectionTableRow';

afterEach(cleanup);

const columns = [
  { id: 'name', label: 'Name', width: 'minmax(100px, 1fr)', className: 'name-col' },
  { id: 'type', label: 'Type', width: '80px' },
];

describe('shared table layer', () => {
  it('builds the grid template from the columns, the single source for header and rows', () => {
    expect(buildCollectionTableGridTemplateColumns(columns)).toBe('minmax(100px, 1fr) 80px');
  });

  it('renders one header cell per column, each with its own class, on the shared grid', () => {
    const { container } = render(<CollectionTable columns={columns} />);

    const cells = [...container.querySelectorAll('.collection-table__header-cell')];
    expect(cells.map((c) => c.textContent)).toEqual(['Name', 'Type']);
    expect(cells[0]).toHaveClass('name-col');
    expect((container.querySelector('.collection-table__header') as HTMLElement).style.gridTemplateColumns).toBe(
      'minmax(100px, 1fr) 80px'
    );
  });

  it('renders rows then the optional footer inside the body — and no footer unless given', () => {
    const withFooter = render(
      <CollectionTable columns={columns} footer={<div data-testid="footer" />}>
        <div data-testid="row" />
      </CollectionTable>
    );
    const body = withFooter.container.querySelector('.collection-table__body')!;
    expect([...body.children].map((c) => c.getAttribute('data-testid'))).toEqual(['row', 'footer']);
    cleanup();

    const without = render(<CollectionTable columns={columns} />);
    expect(without.container.querySelector('.collection-table__body')!.children).toHaveLength(0);
  });

  it('CollectionTableRow applies the grid, opens on click/Enter, ignores clicks on nested buttons, and hosts the actions overlay', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CollectionTableRow gridTemplateColumns="1fr 80px" onClick={onClick} actions={<button>act</button>}>
        <span>cell</span>
      </CollectionTableRow>
    );
    const row = container.firstElementChild as HTMLElement;

    expect(row).toHaveClass('collection-table-row');
    expect(row.style.gridTemplateColumns).toBe('1fr 80px');
    expect(row).toHaveAttribute('role', 'button');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);

    onClick.mockClear();
    fireEvent.click(container.querySelector('.collection-table-row__actions button')!);
    expect(onClick).not.toHaveBeenCalled();
  });
});
