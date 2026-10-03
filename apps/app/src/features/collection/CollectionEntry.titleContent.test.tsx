// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CollectionEntry } from './CollectionEntry';

afterEach(cleanup);

describe('CollectionEntry titleContent', () => {
  it('replaces the plain title inside the same title element (e.g. an inline editor)', () => {
    const { container, queryByText } = render(
      <CollectionEntry title="Plain" titleContent={<input aria-label="edit" />} />
    );

    const title = container.querySelector('.collection-entry__title')!;
    expect(title.querySelector('input[aria-label="edit"]')).not.toBeNull();
    expect(queryByText('Plain')).toBeNull();
  });

  it('absent, renders the plain title exactly as before', () => {
    const { container } = render(<CollectionEntry title="Plain" />);

    expect(container.querySelector('.collection-entry__title')).toHaveTextContent('Plain');
  });
});
