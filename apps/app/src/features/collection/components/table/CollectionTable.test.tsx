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

    const cells = [...container.querySelectorAll('.collection-table__header-cell')];
    expect(cells.map((cell) => cell.textContent)).toEqual(['Name', 'Type']);
    expect(cells[1]).toHaveClass('type-header');
  });

  it('owns the columns on its one grid; the header (and the rows) are subgrids of it', () => {
    const { container } = render(<CollectionTable columns={columns} />);

    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe('minmax(400px, 1fr) 140px');
    expect((container.querySelector('.collection-table__header') as HTMLElement).style.gridTemplateColumns).toBe('');
  });

  it('renders its rows, then the footer, inside the body', () => {
    const { container } = render(
      <CollectionTable columns={columns} footer={<div data-testid="footer" />}>
        <div data-testid="row1" />
        <div data-testid="row2" />
      </CollectionTable>
    );

    const body = container.querySelector('.collection-table__body')!;
    expect([...body.children].map((c) => c.getAttribute('data-testid'))).toEqual(['row1', 'row2', 'footer']);
    expect(screen.queryByTestId('footer')).toBeInTheDocument();
  });

  it('passes className and attributes to the container', () => {
    const { container } = render(<CollectionTable columns={columns} className="mine" data-x="1" />);

    expect(container.firstElementChild).toHaveClass('collection-table', 'mine');
    expect(container.firstElementChild).toHaveAttribute('data-x', '1');
  });
});

describe('CollectionTable — horizontal scrolling only when the columns overflow', () => {
  const sizes = (scrollWidth: number, clientWidth: number) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
  };
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  });

  it('is not a scroller when the content fits, or is over by a sub-pixel amount', () => {
    sizes(800, 800);
    expect(render(<CollectionTable columns={columns} />).container.firstElementChild).not.toHaveClass('collection-table--scrolls');
    cleanup();
    sizes(801, 800);
    expect(render(<CollectionTable columns={columns} />).container.firstElementChild).not.toHaveClass('collection-table--scrolls');
  });

  it('becomes a scroller when the content is genuinely wider than it', () => {
    sizes(1200, 800);
    expect(render(<CollectionTable columns={columns} />).container.firstElementChild).toHaveClass('collection-table--scrolls');
  });

  it('keeps the scroll room and the scrolling together in the stylesheet', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(`${__dirname}/CollectionTable.css`, 'utf8');
    expect(css).toMatch(/\.collection-table--scrolls\s*{[^}]*overflow-x:\s*auto;[^}]*padding-block-end:/);
  });
});
