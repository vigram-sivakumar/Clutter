// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PropertyList } from './PropertyList';
import type { PropertyListItem } from './PropertyList.types';

afterEach(() => cleanup());

const items: PropertyListItem[] = [
  { name: 'Created', type: 'date', value: null, editable: false },
  { name: 'priority', type: 'text', value: 'high', editable: false, onRename: () => true },
];

describe('PropertyList — the name icon', () => {
  it('every name row has its type icon and a vertical-dots icon beside it', () => {
    render(<PropertyList items={items} />);

    const rows = document.querySelectorAll('.property-list__name');
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.querySelectorAll('.property__icon--type')).toHaveLength(1);
      expect(row.querySelectorAll('.property__icon--menu')).toHaveLength(1);
    }
  });

  it('is only a visual swap: no button is added to the name', () => {
    render(<PropertyList items={items} />);

    expect(document.querySelectorAll('.property-list__name button')).toHaveLength(0);
  });

  it('the type icon still differs by property type', () => {
    render(<PropertyList items={items} />);

    const [date, text] = [...document.querySelectorAll('.property__icon--type')].map((icon) => icon.innerHTML);
    expect(date).not.toBe(text);
  });
});
