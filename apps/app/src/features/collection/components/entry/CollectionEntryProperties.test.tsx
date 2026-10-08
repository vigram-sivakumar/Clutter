// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollectionEntryProperties } from './CollectionEntryProperties';

afterEach(cleanup);

describe('CollectionEntryProperties — one value', () => {
  it('draws whatever it is given in its own element', () => {
    const { container } = render(<CollectionEntryProperties>12 September, 09:03 AM</CollectionEntryProperties>);

    expect(container.firstElementChild).toHaveClass('collection-entry-properties');
    expect(container.firstElementChild).toHaveTextContent('12 September, 09:03 AM');
  });

  it('one per value: siblings stay separate elements', () => {
    const { container } = render(
      <>
        <CollectionEntryProperties>5 Oct</CollectionEntryProperties>
        <CollectionEntryProperties>12 KB</CollectionEntryProperties>
      </>
    );

    expect([...container.querySelectorAll('.collection-entry-properties')].map((el) => el.textContent)).toEqual([
      '5 Oct',
      '12 KB',
    ]);
  });

  it('forwards ref, merges className and passes attributes through', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <CollectionEntryProperties ref={ref} className="mine" data-date="2026-09-12T09:03:00.000Z">
        x
      </CollectionEntryProperties>
    );

    expect(ref.current).toBe(container.firstElementChild);
    expect(container.firstElementChild).toHaveClass('collection-entry-properties', 'mine');
    expect(container.firstElementChild).toHaveAttribute('data-date', '2026-09-12T09:03:00.000Z');
  });
});
