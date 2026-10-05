// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionTableRow } from './CollectionTableRow';

afterEach(cleanup);

const row = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CollectionTableRow', () => {
  it('lays its cells out on the grid it is given', () => {
    const { container } = render(
      <CollectionTableRow gridTemplateColumns="1fr 140px">
        <span>a</span>
        <span>b</span>
      </CollectionTableRow>
    );

    expect(row(container)).toHaveClass('cx-collection-table-row');
    expect(row(container).style.gridTemplateColumns).toBe('1fr 140px');
    expect(row(container)).toHaveTextContent('ab');
  });

  it('keeps a caller style alongside the grid', () => {
    const { container } = render(
      <CollectionTableRow gridTemplateColumns="1fr" style={{ opacity: 0.5 }}>
        x
      </CollectionTableRow>
    );

    expect(row(container).style.gridTemplateColumns).toBe('1fr');
    expect(row(container).style.opacity).toBe('0.5');
  });

  it('marks a selected row', () => {
    const { container, rerender } = render(<CollectionTableRow gridTemplateColumns="1fr">x</CollectionTableRow>);
    expect(row(container)).not.toHaveClass('cx-collection-table-row--selected');

    rerender(
      <CollectionTableRow gridTemplateColumns="1fr" isSelected>
        x
      </CollectionTableRow>
    );
    expect(row(container)).toHaveClass('cx-collection-table-row--selected');
  });

  it('draws the actions slot outside the cells', () => {
    const { container } = render(
      <CollectionTableRow gridTemplateColumns="1fr" actions={<button type="button">Restore</button>}>
        x
      </CollectionTableRow>
    );

    expect(container.querySelector('.cx-collection-table-row__actions button')).toHaveTextContent('Restore');
  });

  it('is inert without onClick', () => {
    const { container } = render(<CollectionTableRow gridTemplateColumns="1fr">x</CollectionTableRow>);

    expect(row(container)).not.toHaveAttribute('role');
    expect(row(container)).not.toHaveAttribute('tabindex');
  });

  it('with onClick it is one focusable button that opens on click, Enter and Space', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CollectionTableRow gridTemplateColumns="1fr" onClick={onClick}>
        x
      </CollectionTableRow>
    );

    expect(row(container)).toHaveAttribute('role', 'button');
    expect(row(container)).toHaveAttribute('tabindex', '0');
    fireEvent.click(row(container));
    fireEvent.keyDown(row(container), { key: 'Enter' });
    fireEvent.keyDown(row(container), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('does not open for a key pressed in a cell, nor for a click on a nested control', () => {
    const onClick = vi.fn();
    const onNested = vi.fn();
    render(
      <CollectionTableRow gridTemplateColumns="1fr 1fr" onClick={onClick}>
        <span data-testid="cell">a</span>
        <button type="button" onClick={onNested}>
          Change
        </button>
      </CollectionTableRow>
    );

    fireEvent.keyDown(screen.getByTestId('cell'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onNested).toHaveBeenCalledTimes(1);
  });
});
