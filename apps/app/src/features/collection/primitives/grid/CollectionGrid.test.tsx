// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollectionGrid } from './CollectionGrid';

afterEach(cleanup);

describe('CollectionGrid', () => {
  it('renders any children, in order, without knowing what they are', () => {
    const Anything = () => <i data-testid="anything" />;
    const { container } = render(
      <CollectionGrid columns={{ min: 200, max: 5 }}>
        <div data-testid="a" />
        <Anything />
        text
      </CollectionGrid>
    );

    const grid = container.firstElementChild!;
    expect(grid).toHaveClass('cx-collection-grid');
    expect(screen.getByTestId('a').nextElementSibling).toBe(screen.getByTestId('anything'));
    expect(grid.childNodes).toHaveLength(3);
  });

  it('hands min and max to the stylesheet as custom properties', () => {
    const { container } = render(
      <CollectionGrid columns={{ min: 140, max: 6 }}>
        <div />
      </CollectionGrid>
    );
    const grid = container.firstElementChild as HTMLElement;

    expect(grid.style.getPropertyValue('--cx-collection-grid-min')).toBe('140px');
    expect(grid.style.getPropertyValue('--cx-collection-grid-max')).toBe('6');
  });

  it('keeps min and max sane: at least 1px wide, at least one column, whole columns', () => {
    const { container } = render(
      <CollectionGrid columns={{ min: 0, max: 0 }}>
        <div />
      </CollectionGrid>
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.getPropertyValue('--cx-collection-grid-min')).toBe('1px');
    expect(grid.style.getPropertyValue('--cx-collection-grid-max')).toBe('1');

    cleanup();
    const { container: other } = render(
      <CollectionGrid columns={{ min: 100, max: 4.9 }}>
        <div />
      </CollectionGrid>
    );
    expect((other.firstElementChild as HTMLElement).style.getPropertyValue('--cx-collection-grid-max')).toBe('4');
  });

  it('fixes the row height only when asked', () => {
    const { container, rerender } = render(
      <CollectionGrid columns={{ min: 200, max: 5 }}>
        <div />
      </CollectionGrid>
    );
    let grid = container.firstElementChild as HTMLElement;
    expect(grid).not.toHaveClass('cx-collection-grid--fixed-rows');
    expect(grid.style.getPropertyValue('--cx-collection-grid-row-height')).toBe('');

    rerender(
      <CollectionGrid columns={{ min: 200, max: 5 }} rowHeight={54}>
        <div />
      </CollectionGrid>
    );
    grid = container.firstElementChild as HTMLElement;
    expect(grid).toHaveClass('cx-collection-grid--fixed-rows');
    expect(grid.style.getPropertyValue('--cx-collection-grid-row-height')).toBe('54px');
  });

  it('passes className, style and attributes through', () => {
    const { container } = render(
      <CollectionGrid columns={{ min: 200, max: 5 }} className="extra" style={{ opacity: 0.5 }} data-x="1">
        <div />
      </CollectionGrid>
    );
    const grid = container.firstElementChild as HTMLElement;

    expect(grid).toHaveClass('cx-collection-grid', 'extra');
    expect(grid.style.opacity).toBe('0.5');
    expect(grid).toHaveAttribute('data-x', '1');
    // an explicit style does not drop the layout properties
    expect(grid.style.getPropertyValue('--cx-collection-grid-min')).toBe('200px');
  });

  // jsdom has no layout: the column math itself is checked on the stylesheet.
  it('the stylesheet is an auto-fill grid between min and 1/max of the row', () => {
    const css = readFileSync(join(__dirname, 'CollectionGrid.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(css).toMatch(/repeat\(\s*auto-fill/);
    expect(css).toMatch(/var\(--cx-collection-grid-min\)/);
    expect(css).toMatch(/var\(--cx-collection-grid-max\) - 1/);
    expect(css).toMatch(/grid-auto-rows:\s*var\(--cx-collection-grid-row-height\)/);
  });
});
