// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionListGrid } from './CollectionListGrid';
import { CollectionListRow } from './CollectionListRow';

afterEach(cleanup);

describe('shared list layer', () => {
  it('CollectionListGrid is a plain column container', () => {
    const { container } = render(
      <CollectionListGrid className="extra">
        <div>row</div>
      </CollectionListGrid>
    );

    expect(container.firstElementChild).toHaveClass('collection-list-grid', 'extra');
  });

  it('CollectionListRow is a CollectionEntry with the list-row class, title/metadata/click intact', () => {
    const onClick = vi.fn();
    const { container, getByText } = render(
      <CollectionListRow title="Name" metadata={<span>Meta</span>} onClick={onClick} />
    );

    const row = container.firstElementChild!;
    expect(row).toHaveClass('collection-entry', 'collection-list-row');
    expect(getByText('Name')).toBeInTheDocument();
    expect(getByText('Meta')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
